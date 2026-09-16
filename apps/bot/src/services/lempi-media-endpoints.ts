import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import { config } from '../config.js'
import { downloadLempiMedia, type LempiDownloadedMedia, type LempiMediaKind } from './lempi-api.js'
import { requestLempiJson } from './lempi-client.js'

const API_TIMEOUT_MS = 90_000
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000

export type LempiTikTokVideo = {
  id: string
  title: string
  url: string
  downloadUrl: string
  thumbnail?: string
  username?: string
  nickname?: string
  views?: number
  likes?: number
}

export type LempiTikTokProfile = {
  username: string
  nickname?: string
  url: string
  avatar?: string
  bio?: string
  followers?: number
  following?: number
  likes?: number
  videos?: number
  verified?: boolean
}

export type LempiInstagramProfile = {
  username: string
  name?: string
  avatar?: string
  bio?: string
  followers?: number
  following?: number
  posts?: number
  verified?: boolean
  private?: boolean
}

export type LempiHappyModApp = {
  numero?: number
  nombre: string
  version?: string
  imagen?: string
  url: string
  download: string
}

export type LempiRemoteFile = {
  filePath: string
  fileName: string
  size: number
  kind: LempiMediaKind
  sourceUrl: string
  cleanup: () => Promise<void>
}

type JsonRecord = Record<string, unknown>
type UrlCandidate = { url: string; hint: string; kind: LempiMediaKind; score: number; name?: string }

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function boolValue(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (/^(?:true|yes|si|sí|1)$/i.test(value.trim())) return true
    if (/^(?:false|no|0)$/i.test(value.trim())) return false
  }
  return undefined
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const result = stringValue(value)
    if (result) return result
  }
  return undefined
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const result = numberValue(value)
    if (result !== undefined) return result
  }
  return undefined
}

function normalizeHttpUrl(value: unknown) {
  const text = stringValue(value)
  if (!text) return undefined
  try {
    const url = new URL(text.replace(/\\u0026/gi, '&').replace(/\\\//g, '/'))
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function walkRecords(value: unknown, visit: (record: JsonRecord) => void, depth = 0) {
  if (depth > 10 || value === null || value === undefined) return
  if (Array.isArray(value)) {
    for (const item of value) walkRecords(item, visit, depth + 1)
    return
  }
  const record = asRecord(value)
  if (!record) return
  visit(record)
  for (const child of Object.values(record)) walkRecords(child, visit, depth + 1)
}

function inferKind(url: string, hint = ''): LempiMediaKind {
  const value = `${hint} ${url}`.toLowerCase()
  if (/\.(?:jpe?g|png|webp|gif|avif)(?:$|[?#])|image|imagen|photo|foto/.test(value)) return 'image'
  if (/\.(?:mp4|webm|mov|m4v|mkv)(?:$|[?#])|video|reel|clip/.test(value)) return 'video'
  if (/\.(?:mp3|m4a|aac|ogg|opus|wav|flac)(?:$|[?#])|audio|music|musica|música/.test(value)) return 'audio'
  return 'unknown'
}

function candidateScore(url: string, hint: string, kind: LempiMediaKind) {
  const input = `${hint} ${url}`.toLowerCase()
  let score = 0
  if (/download|descarga|direct|media|play|video_url|download_url|file_url|url_download/.test(input)) score += 280
  if (kind === 'video') score += 180
  if (kind === 'image') score += 120
  if (kind === 'audio') score += 100
  if (/\.mp4(?:$|[?#])/.test(input)) score += 220
  if (/\.(?:jpe?g|png|webp|avif)(?:$|[?#])/.test(input)) score += 160
  if (/\.apk(?:$|[?#])/.test(input)) score += 260
  if (/\.zip|\.rar|\.7z|\.pdf|\.docx?|\.xlsx?|\.pptx?|\.txt(?:$|[?#])/.test(input)) score += 180
  if (/thumbnail|thumb|avatar|profile|cover|portada/.test(hint.toLowerCase())) score -= 260
  if (/api\.lempi\.lat/i.test(url)) score -= 500
  return score
}

function collectUrlCandidates(value: unknown, hint = '', out: UrlCandidate[] = [], seen = new Set<string>(), depth = 0) {
  if (depth > 10 || value === null || value === undefined) return out

  const direct = normalizeHttpUrl(value)
  if (direct) {
    if (!seen.has(direct)) {
      seen.add(direct)
      const kind = inferKind(direct, hint)
      out.push({ url: direct, hint, kind, score: candidateScore(direct, hint, kind) })
    }
    return out
  }

  if (Array.isArray(value)) {
    for (const item of value) collectUrlCandidates(item, hint, out, seen, depth + 1)
    return out
  }

  const record = asRecord(value)
  if (!record) return out
  const name = firstString(record.name, record.nombre, record.filename, record.file_name, record.title, record.titulo)
  for (const [key, child] of Object.entries(record)) {
    const before = out.length
    collectUrlCandidates(child, `${hint}.${key}`, out, seen, depth + 1)
    if (name && out.length > before) {
      for (let index = before; index < out.length; index += 1) out[index]!.name ??= name
    }
  }
  return out
}

function usableCandidates(payload: unknown, preferred?: LempiMediaKind, limit = 12) {
  const rows = collectUrlCandidates(payload)
    .filter((item) => !/api\.lempi\.lat/i.test(item.url))
    .sort((a, b) => b.score - a.score)
  const preferredRows = preferred ? rows.filter((item) => item.kind === preferred) : rows
  const pool = preferredRows.length ? preferredRows : rows
  return [...new Map(pool.map((item) => [item.url, item])).values()].slice(0, limit)
}

async function requestVariants(endpoint: string, variants: Array<Record<string, string | number | undefined>>) {
  let lastError: unknown
  for (const params of variants) {
    try {
      return await requestLempiJson<unknown>(endpoint, params, { timeoutMs: API_TIMEOUT_MS })
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error('La API de LemPi no devolvió resultados.')
}

function usernameFromInput(input: string, network: 'tiktok' | 'instagram') {
  const raw = input.trim().replace(/^@/, '')
  if (!raw) throw new Error(`Indica un usuario de ${network === 'tiktok' ? 'TikTok' : 'Instagram'}.`)
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw)
    if (network === 'tiktok') {
      if (!(url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com'))) throw new Error('El enlace no pertenece a TikTok.')
      const match = /^\/@([^/?#]+)/.exec(url.pathname)
      if (!match?.[1]) throw new Error('El enlace no corresponde a un perfil de TikTok.')
      return decodeURIComponent(match[1])
    }
    if (!(url.hostname === 'instagram.com' || url.hostname.endsWith('.instagram.com'))) throw new Error('El enlace no pertenece a Instagram.')
    const first = url.pathname.split('/').filter(Boolean)[0]
    if (!first || ['p', 'reel', 'reels', 'stories', 'explore'].includes(first.toLowerCase())) throw new Error('El enlace no corresponde a un perfil de Instagram.')
    return decodeURIComponent(first)
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(raw)) throw new Error('El usuario indicado no es válido.')
  return raw
}

function normalizeTikTokVideo(record: JsonRecord): LempiTikTokVideo | null {
  const author = asRecord(record.author) ?? asRecord(record.autor) ?? asRecord(record.user) ?? asRecord(record.usuario)
  const stats = asRecord(record.stats) ?? asRecord(record.estadisticas)
  const sourceUrl = firstString(record.url, record.link, record.tiktok, record.share_url, record.shareUrl)
  const direct = firstString(record.video, record.download, record.descarga, record.mp4, record.video_url, record.videoUrl, record.download_url, record.downloadUrl)
  const username = firstString(author?.username, author?.uniqueId, author?.usuario, record.username, record.usuario)
  const id = firstString(record.id, record.video_id, record.videoId) ?? sourceUrl ?? direct
  if (!id || !direct) return null
  const canonical = sourceUrl ?? (username && /^\d{6,30}$/.test(id) ? `https://www.tiktok.com/@${encodeURIComponent(username)}/video/${id}` : direct)
  return {
    id,
    title: firstString(record.title, record.titulo, record.desc, record.description, record.descripcion) ?? (username ? `Video de @${username}` : 'TikTok'),
    url: canonical,
    downloadUrl: direct,
    thumbnail: firstString(record.thumbnail, record.thumb, record.cover, record.portada, author?.avatar),
    username,
    nickname: firstString(author?.name, author?.nombre, author?.nickname),
    views: firstNumber(stats?.views, stats?.vistas, stats?.playCount, record.views, record.vistas),
    likes: firstNumber(stats?.likes, stats?.diggCount, record.likes),
  }
}

function extractTikTokVideos(payload: unknown, limit = 12) {
  const rows: LempiTikTokVideo[] = []
  walkRecords(payload, (record) => {
    const item = normalizeTikTokVideo(record)
    if (item) rows.push(item)
  })
  return [...new Map(rows.map((item) => [item.url, item])).values()].slice(0, limit)
}

function normalizeTikTokProfile(record: JsonRecord): LempiTikTokProfile | null {
  const nested = asRecord(record.user) ?? asRecord(record.usuario) ?? asRecord(record.author) ?? asRecord(record.autor)
  const stats = asRecord(record.stats) ?? asRecord(record.estadisticas) ?? asRecord(record.statsV2)
  const username = firstString(record.username, record.uniqueId, record.usuario, nested?.username, nested?.uniqueId, nested?.usuario)
  if (!username || !/^[A-Za-z0-9._-]{1,64}$/.test(username)) return null
  return {
    username,
    nickname: firstString(record.nickname, record.name, record.nombre, nested?.nickname, nested?.name, nested?.nombre),
    url: firstString(record.url, record.link) ?? `https://www.tiktok.com/@${encodeURIComponent(username)}`,
    avatar: firstString(record.avatar, record.avatarUrl, record.avatarLarger, record.avatarMedium, nested?.avatar, nested?.avatarUrl, nested?.avatarLarger),
    bio: firstString(record.bio, record.signature, record.descripcion, record.description, nested?.bio, nested?.signature),
    followers: firstNumber(record.followers, record.followerCount, stats?.followers, stats?.followerCount, stats?.seguidores),
    following: firstNumber(record.following, record.followingCount, stats?.following, stats?.followingCount, stats?.seguidos),
    likes: firstNumber(record.likes, record.heartCount, stats?.likes, stats?.heartCount, stats?.heart),
    videos: firstNumber(record.videos, record.videoCount, stats?.videos, stats?.videoCount),
    verified: boolValue(record.verified ?? record.verificado ?? nested?.verified ?? nested?.verificado),
  }
}

export async function searchLempiTikTokVideosV2(query: string, limit = 10) {
  const payload = await requestVariants('/s/tiktok', [
    { q: query, limit },
    { query, limit },
  ])
  return extractTikTokVideos(payload, Math.max(1, Math.min(12, limit)))
}

export async function downloadLempiTikTokVideo(sourceUrl: string, baseName = 'tiktok') {
  const payload = await requestVariants('/s/tiktok', [
    { url: sourceUrl },
    { q: sourceUrl },
  ])
  const normalized = extractTikTokVideos(payload, 5)
  const direct = normalized[0]?.downloadUrl ?? usableCandidates(payload, 'video', 5)[0]?.url
  if (!direct) throw new Error('LemPi no devolvió un video descargable de TikTok.')
  return downloadLempiMedia(direct, { kind: 'video', baseName })
}

export async function searchLempiTikTokProfilesV2(input: string, limit = 8) {
  const query = input.trim().slice(0, 120)
  if (!query) throw new Error('Indica el usuario o nombre que deseas buscar en TikTok.')
  const payload = await requestVariants('/s/tiktokprofile', [
    { q: query, limit },
    { username: query.replace(/^@/, ''), limit },
  ])
  const profiles: LempiTikTokProfile[] = []
  walkRecords(payload, (record) => {
    const item = normalizeTikTokProfile(record)
    if (item) profiles.push(item)
  })
  return [...new Map(profiles.map((item) => [item.username.toLowerCase(), item])).values()].slice(0, Math.max(1, Math.min(12, limit)))
}

export async function getLempiTikTokProfileV2(input: string) {
  const username = usernameFromInput(input, 'tiktok')
  const rows = await searchLempiTikTokProfilesV2(username, 12)
  const exact = rows.find((item) => item.username.toLowerCase() === username.toLowerCase())
  if (exact) return exact
  if (rows[0]) return rows[0]
  throw new Error('LemPi no encontró ese perfil de TikTok.')
}

function isInstagramReel(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl)
    return /\/(?:reel|reels)\//i.test(url.pathname)
  } catch {
    return false
  }
}

export async function downloadLempiInstagramV2(sourceUrl: string, imagesOnly = false) {
  const endpoint = !imagesOnly && isInstagramReel(sourceUrl) ? '/dl/igreel' : '/dl/instagram'
  const payload = await requestVariants(endpoint, [{ url: sourceUrl }, { q: sourceUrl }])
  const preferred: LempiMediaKind | undefined = imagesOnly ? 'image' : isInstagramReel(sourceUrl) ? 'video' : undefined
  const candidates = usableCandidates(payload, preferred, 12)
    .filter((item) => !imagesOnly || item.kind === 'image')
  if (!candidates.length) throw new Error('LemPi no devolvió contenido descargable de Instagram.')

  const files: LempiDownloadedMedia[] = []
  for (const [index, item] of candidates.entries()) {
    const kind = item.kind === 'unknown' ? (imagesOnly ? 'image' : 'video') : item.kind
    try {
      files.push(await downloadLempiMedia(item.url, { kind, baseName: `instagram-${index + 1}` }))
    } catch {
      // A publication may include one stale CDN URL; continue with the remaining media.
    }
  }
  if (!files.length) throw new Error('No se pudo descargar el contenido de Instagram.')
  return files
}

function normalizeInstagramProfile(record: JsonRecord): LempiInstagramProfile | null {
  const user = asRecord(record.user) ?? asRecord(record.usuario) ?? asRecord(record.profile) ?? asRecord(record.perfil)
  const username = firstString(record.username, record.usuario, user?.username, user?.usuario)
  if (!username || !/^[A-Za-z0-9._-]{1,64}$/.test(username)) return null
  return {
    username,
    name: firstString(record.name, record.nombre, record.full_name, record.fullName, user?.name, user?.nombre, user?.full_name),
    avatar: firstString(record.avatar, record.profile_pic_url, record.profilePicUrl, record.foto, user?.avatar, user?.profile_pic_url),
    bio: firstString(record.bio, record.biography, record.biografia, record.descripcion, user?.bio, user?.biography),
    followers: firstNumber(record.followers, record.followers_count, record.followerCount, record.seguidores, user?.followers),
    following: firstNumber(record.following, record.following_count, record.followingCount, record.seguidos, user?.following),
    posts: firstNumber(record.posts, record.media_count, record.mediaCount, record.publicaciones, user?.posts),
    verified: boolValue(record.verified ?? record.verificado ?? user?.verified),
    private: boolValue(record.private ?? record.is_private ?? record.isPrivate ?? user?.private),
  }
}

export async function stalkLempiInstagram(input: string) {
  const username = usernameFromInput(input, 'instagram')
  const payload = await requestVariants('/tools/stalkig', [
    { username },
    { user: username },
    { q: username },
  ])
  const profiles: LempiInstagramProfile[] = []
  walkRecords(payload, (record) => {
    const item = normalizeInstagramProfile(record)
    if (item) profiles.push(item)
  })
  const exact = profiles.find((item) => item.username.toLowerCase() === username.toLowerCase()) ?? profiles[0]
  if (!exact) throw new Error('LemPi no devolvió información pública de ese perfil de Instagram.')
  return exact
}

function normalizeHappyMod(record: JsonRecord): LempiHappyModApp | null {
  const nombre = firstString(record.nombre, record.name, record.title, record.app)
  const url = normalizeHttpUrl(record.url ?? record.link ?? record.page ?? record.source)
  const download = normalizeHttpUrl(record.download ?? record.descarga ?? record.apk ?? record.apk_url ?? record.apkUrl ?? record.direct ?? record.download_url)
  if (!nombre || !download) return null
  return {
    numero: firstNumber(record.numero, record.number, record.id),
    nombre,
    version: firstString(record.version, record.ver),
    imagen: normalizeHttpUrl(record.imagen ?? record.image ?? record.icon ?? record.logo),
    url: url ?? download,
    download,
  }
}

export async function searchLempiHappyModV2(query: string, limit = 10) {
  const text = query.trim()
  if (text.length < 2) throw new Error('Escribe al menos 2 caracteres para buscar en HappyMod.')
  const payload = await requestLempiJson<unknown>('/search/happymod', { q: text, limit: Math.max(1, Math.min(20, limit)) }, { timeoutMs: API_TIMEOUT_MS })
  const rows: LempiHappyModApp[] = []
  walkRecords(payload, (record) => {
    const item = normalizeHappyMod(record)
    if (item) rows.push(item)
  })
  return [...new Map(rows.map((item) => [item.download, item])).values()].slice(0, Math.max(1, Math.min(20, limit)))
}

export async function downloadLempiHappyModV2(app: LempiHappyModApp) {
  return downloadLempiMedia(app.download, {
    kind: 'document',
    baseName: `happymod-${app.nombre}-${app.version ?? 'mod'}`,
  })
}

export async function downloadLempiLikee(sourceUrl: string) {
  const payload = await requestVariants('/dl/likee', [{ url: sourceUrl }, { q: sourceUrl }])
  const direct = usableCandidates(payload, 'video', 6)[0]?.url
  if (!direct) throw new Error('LemPi no devolvió un video descargable de Likee.')
  return downloadLempiMedia(direct, { kind: 'video', baseName: 'likee-video' })
}

function sanitizeFileName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110) || 'terabox-file'
}

function filenameFromDisposition(value: string | null) {
  if (!value) return undefined
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1]
  if (utf) {
    try { return decodeURIComponent(utf.replace(/^['"]|['"]$/g, '')) } catch { return utf }
  }
  return /filename\s*=\s*["']?([^"';]+)["']?/i.exec(value)?.[1]?.trim()
}

function kindFromContentType(type: string, url: string): LempiMediaKind {
  const input = `${type} ${url}`.toLowerCase()
  if (/image\//.test(input)) return 'image'
  if (/video\//.test(input)) return 'video'
  if (/audio\//.test(input)) return 'audio'
  return inferKind(url, type) === 'unknown' ? 'document' : inferKind(url, type)
}

async function downloadRemoteFile(candidate: UrlCandidate, index: number): Promise<LempiRemoteFile> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-terabox-'))
  try {
    const response = await fetch(candidate.url, {
      redirect: 'follow',
      headers: { 'user-agent': 'GhostNexoraBot', accept: '*/*' },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
    if (!response.ok || !response.body) throw new Error(`El archivo respondió HTTP ${response.status}.`)

    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > config.maxDownloadBytes) throw new Error(`El archivo supera el límite de ${config.maxDownloadMb} MB.`)

    const finalUrl = response.url || candidate.url
    const dispositionName = filenameFromDisposition(response.headers.get('content-disposition'))
    let urlName: string | undefined
    try {
      const pathname = new URL(finalUrl).pathname
      const base = decodeURIComponent(path.basename(pathname))
      if (base && base !== '/' && base !== '.') urlName = base
    } catch {
      // Keep candidate name fallback.
    }
    const fileName = sanitizeFileName(dispositionName ?? candidate.name ?? urlName ?? `terabox-file-${index + 1}`)
    const filePath = path.join(dir, fileName)

    let size = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length
        callback(size > config.maxDownloadBytes ? new Error(`El archivo supera el límite de ${config.maxDownloadMb} MB.`) : null, chunk)
      },
    })
    await pipeline(response.body as any, limiter, createWriteStream(filePath, { mode: 0o600 }))
    const info = await stat(filePath)
    if (info.size <= 0) throw new Error('TeraBox devolvió un archivo vacío.')

    return {
      filePath,
      fileName,
      size: info.size,
      kind: kindFromContentType(response.headers.get('content-type') ?? '', finalUrl),
      sourceUrl: candidate.url,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

export async function downloadLempiTerabox(sourceUrl: string, limit = 10) {
  const payload = await requestVariants('/dl/terabox', [{ url: sourceUrl }, { q: sourceUrl }])
  const candidates = usableCandidates(payload, undefined, Math.max(1, Math.min(10, limit)))
    .filter((item) => item.score > -100)
    .filter((item) => !/terabox\.com|1024terabox\.com|teraboxapp\.com/i.test(new URL(item.url).hostname))
  if (!candidates.length) throw new Error('LemPi no devolvió archivos descargables de TeraBox.')

  const files: LempiRemoteFile[] = []
  for (const [index, candidate] of candidates.entries()) {
    try {
      files.push(await downloadRemoteFile(candidate, index))
    } catch {
      // Continue with the remaining direct files returned by LemPi.
    }
  }
  if (!files.length) throw new Error('No se pudo descargar ningún archivo de TeraBox.')
  return files
}
