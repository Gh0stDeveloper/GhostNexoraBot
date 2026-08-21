import { createDecipheriv } from 'node:crypto'
import { logger } from '../utils/logger.js'

export type SaveTubeKind = 'mp3' | 'mp4'

export type SaveTubeResolved = {
  url: string
  title?: string
  duration?: number
  thumbnail?: string
  fileName?: string
  provider: string
}

const SAVE_TUBE_KEY = Buffer.from('C5D58EF67A7584E4A29F6C35BBC4EB12', 'hex')
const SAVE_TUBE_DISCOVERY = 'https://media.savetube.me/api/random-cdn'
const SAVE_TUBE_ORIGIN = 'https://ytsave.savetube.me'
const SAVE_TUBE_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'content-type': 'application/json',
  origin: SAVE_TUBE_ORIGIN,
  referer: `${SAVE_TUBE_ORIGIN}/`,
  'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
}

function compact(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 220)
}

function safeFileBase(value: string) {
  const clean = value.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-')
  return clean.slice(0, 80) || 'youtube'
}

function validHttpUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function decryptSaveTube(payload: unknown) {
  if (typeof payload !== 'string' || !payload.trim()) throw new Error('SaveTube no devolvió datos cifrados.')
  const raw = Buffer.from(payload.replace(/\s+/g, ''), 'base64')
  if (raw.length <= 16) throw new Error('SaveTube devolvió una respuesta cifrada inválida.')
  const iv = raw.subarray(0, 16)
  const decipher = createDecipheriv('aes-128-cbc', SAVE_TUBE_KEY, iv)
  const json = Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]).toString('utf8')
  return JSON.parse(json) as Record<string, unknown>
}

async function saveTubeCdn() {
  const response = await fetch(SAVE_TUBE_DISCOVERY, {
    headers: {
      accept: 'application/json',
      origin: SAVE_TUBE_ORIGIN,
      referer: `${SAVE_TUBE_ORIGIN}/`,
      'user-agent': SAVE_TUBE_HEADERS['user-agent'],
    },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`SaveTube discovery respondió HTTP ${response.status}.`)
  const data = await response.json() as { cdn?: unknown }
  if (typeof data.cdn !== 'string' || !/^[a-z0-9.-]+$/i.test(data.cdn)) throw new Error('SaveTube no devolvió un CDN válido.')
  return data.cdn
}

export async function resolveSaveTubeYouTube(youtubeUrl: string, kind: SaveTubeKind, quality = 720): Promise<SaveTubeResolved> {
  const cdn = await saveTubeCdn()
  const infoResponse = await fetch(`https://${cdn}/v2/info`, {
    method: 'POST',
    headers: SAVE_TUBE_HEADERS,
    body: JSON.stringify({ url: youtubeUrl }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!infoResponse.ok) throw new Error(`SaveTube info respondió HTTP ${infoResponse.status}.`)
  const infoPayload = await infoResponse.json() as { status?: unknown; data?: unknown; message?: unknown }
  if (infoPayload.status === false) throw new Error(typeof infoPayload.message === 'string' ? infoPayload.message : 'SaveTube rechazó el video.')
  const info = decryptSaveTube(infoPayload.data)
  const id = typeof info.id === 'string' ? info.id : ''
  const key = typeof info.key === 'string' ? info.key : ''
  if (!id || !key) throw new Error('SaveTube no devolvió id/key de conversión.')

  const requestedQuality = kind === 'mp3'
    ? '128'
    : String(Math.max(144, Math.min(1080, Number.isFinite(quality) ? quality : 720)))
  const downloadResponse = await fetch(`https://${cdn}/download`, {
    method: 'POST',
    headers: SAVE_TUBE_HEADERS,
    body: JSON.stringify({
      id,
      key,
      downloadType: kind === 'mp3' ? 'audio' : 'video',
      quality: requestedQuality,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!downloadResponse.ok) throw new Error(`SaveTube download respondió HTTP ${downloadResponse.status}.`)
  const downloadPayload = await downloadResponse.json() as {
    status?: unknown
    data?: { downloadUrl?: unknown }
    message?: unknown
  }
  const direct = validHttpUrl(downloadPayload.data?.downloadUrl)
  if (!direct) throw new Error(typeof downloadPayload.message === 'string' ? downloadPayload.message : 'SaveTube no entregó una URL de descarga.')

  const title = typeof info.title === 'string' ? info.title.trim() : undefined
  const duration = Number(info.duration)
  const thumbnail = validHttpUrl(info.thumbnail)
  logger.info({ provider: 'SaveTube', kind, cdn }, 'youtube savetube provider resolved')
  return {
    url: direct,
    title,
    duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
    thumbnail,
    fileName: `${safeFileBase(title || id)}.${kind}`,
    provider: `SaveTube ${cdn}`,
  }
}

function setCookieHeader(response: Response) {
  const getter = response.headers as Headers & { getSetCookie?: () => string[] }
  const cookies = typeof getter.getSetCookie === 'function' ? getter.getSetCookie() : []
  const raw = cookies.length ? cookies.join('; ') : response.headers.get('set-cookie') ?? ''
  const session = /PHPSESSID=([^;]+)/i.exec(raw)?.[1]
  return session ? `PHPSESSID=${session}` : ''
}

function htmlToken(html: string, name: string) {
  const match = new RegExp(`["']${name}["']\\s*:\\s*["']([^"']+)["']`, 'i').exec(html)
    ?? new RegExp(`name=["']${name}["'][^>]*value=["']([^"']+)["']`, 'i').exec(html)
  return match?.[1]
}

export async function resolveYtmp3WtfYouTube(youtubeUrl: string, kind: SaveTubeKind): Promise<SaveTubeResolved> {
  const page = kind === 'mp3' ? 'button' : 'vidbutton'
  const endpoint = kind === 'mp3' ? 'convert' : 'vidconvert'
  const landing = await fetch(`https://v2.ytmp3.wtf/${page}/?url=${encodeURIComponent(youtubeUrl)}`, {
    headers: { 'user-agent': SAVE_TUBE_HEADERS['user-agent'], accept: 'text/html,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  })
  if (!landing.ok) throw new Error(`YTMP3.WTF respondió HTTP ${landing.status}.`)
  const html = await landing.text()
  const cookie = setCookieHeader(landing)
  const tokenId = htmlToken(html, 'token_id')
  const tokenValidTo = htmlToken(html, 'token_validto')
  if (!tokenId || !tokenValidTo) throw new Error('YTMP3.WTF no devolvió tokens de conversión.')

  const start = await fetch(`https://v2.ytmp3.wtf/${endpoint}/`, {
    method: 'POST',
    headers: {
      'user-agent': SAVE_TUBE_HEADERS['user-agent'],
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      ...(cookie ? { cookie } : {}),
      origin: 'https://v2.ytmp3.wtf',
      referer: `https://v2.ytmp3.wtf/${page}/`,
      accept: 'application/json, text/plain, */*',
    },
    body: new URLSearchParams({
      url: youtubeUrl,
      convert: 'gogogo',
      token_id: tokenId,
      token_validto: tokenValidTo,
    }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!start.ok) throw new Error(`YTMP3.WTF convert respondió HTTP ${start.status}.`)
  const job = await start.json() as { jobid?: unknown; error?: unknown }
  if (typeof job.jobid !== 'string' || !job.jobid) throw new Error(typeof job.error === 'string' ? job.error : 'YTMP3.WTF no creó el trabajo de conversión.')

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_200))
    const check = await fetch(`https://v2.ytmp3.wtf/${endpoint}/?jobid=${encodeURIComponent(job.jobid)}&time=${Date.now()}`, {
      headers: {
        'user-agent': SAVE_TUBE_HEADERS['user-agent'],
        ...(cookie ? { cookie } : {}),
        accept: 'application/json, text/plain, */*',
      },
      signal: AbortSignal.timeout(6_000),
    })
    if (!check.ok) continue
    const data = await check.json() as { ready?: unknown; dlurl?: unknown; title?: unknown }
    const direct = validHttpUrl(data.dlurl)
    if (data.ready && direct) {
      const title = typeof data.title === 'string' ? data.title.trim() : undefined
      logger.info({ provider: 'YTMP3.WTF', kind }, 'youtube ytmp3wtf provider resolved')
      return {
        url: direct,
        title,
        fileName: `${safeFileBase(title || 'youtube')}.${kind}`,
        provider: 'YTMP3.WTF',
      }
    }
  }
  throw new Error('YTMP3.WTF agotó el tiempo de conversión.')
}

export async function resolveModernWebYouTube(youtubeUrl: string, kind: SaveTubeKind, quality = 720) {
  const attempts = [
    resolveSaveTubeYouTube(youtubeUrl, kind, quality),
    resolveYtmp3WtfYouTube(youtubeUrl, kind),
  ]
  try {
    return await Promise.any(attempts)
  } catch (error) {
    if (error instanceof AggregateError) {
      const details = error.errors.map((item) => compact(item)).slice(0, 2)
      throw new Error(`SaveTube/YTMP3.WTF agotados: ${details.join(' · ')}`)
    }
    throw error
  }
}
