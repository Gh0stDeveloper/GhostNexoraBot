import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import { config } from '../config.js'

const SEARCH_BASE = 'https://ws75.aptoide.com/api/7/apps/search'
const META_BASE = 'https://ws2.aptoide.com/api/7/app/getMeta'
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36 GhostNexoraBot/1.1'

export type AptoideApp = {
  id: number
  name: string
  packageName: string
  version?: string
  size?: number
  icon?: string
  graphic?: string
  updated?: string
  developer?: string
  downloads?: number
  rating?: number
  trusted?: boolean
  malwareRank?: string
  apkUrl?: string
  summary?: string
}

export type ApkDownloadResult = AptoideApp & {
  filePath: string
  fileName: string
  size: number
  cleanup: () => Promise<void>
}

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function validHttps(value: unknown) {
  const raw = stringValue(value)
  if (!raw) return undefined
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'https:' ? parsed.toString() : undefined
  } catch {
    return undefined
  }
}

function safeFileBase(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 90) || 'android-app'
}

function parseApp(value: unknown): AptoideApp | undefined {
  const app = record(value)
  if (!app) return undefined
  const id = numberValue(app.id)
  const name = stringValue(app.name)
  const packageName = stringValue(app.package)
  if (!id || !name || !packageName) return undefined

  const file = record(app.file)
  const malware = record(file?.malware)
  const developer = record(app.developer)
  const stats = record(app.stats)
  const rating = record(stats?.rating)
  const media = record(app.media)
  const malwareRank = stringValue(malware?.rank)

  return {
    id,
    name,
    packageName,
    version: stringValue(file?.vername),
    size: numberValue(file?.filesize) ?? numberValue(app.size),
    icon: validHttps(app.icon),
    graphic: validHttps(app.graphic),
    updated: stringValue(app.updated) ?? stringValue(app.modified),
    developer: stringValue(developer?.name),
    downloads: numberValue(stats?.downloads),
    rating: numberValue(rating?.avg),
    trusted: malwareRank?.toUpperCase() === 'TRUSTED',
    malwareRank,
    apkUrl: validHttps(file?.path) ?? validHttps(file?.path_alt),
    summary: stringValue(media?.summary) ?? stringValue(media?.description)?.replace(/\s+/g, ' ').slice(0, 280),
  }
}

async function fetchJson(url: string, timeoutMs = 20_000) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': UA },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`Aptoide respondió HTTP ${response.status}.`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('json')) throw new Error('Aptoide no devolvió JSON.')
  return response.json() as Promise<JsonRecord>
}

export async function searchAptoideApps(query: string, limit = 10): Promise<AptoideApp[]> {
  const text = query.trim()
  if (text.length < 2) throw new Error('Escribe al menos 2 caracteres para buscar una aplicación.')
  const count = Math.max(1, Math.min(10, limit))
  const endpoint = `${SEARCH_BASE}/query=${encodeURIComponent(text)}/limit=${count}/mature=false/aab=false`
  const payload = await fetchJson(endpoint)
  const datalist = record(payload.datalist)
  const list = Array.isArray(datalist?.list) ? datalist.list : []
  return list.map(parseApp).filter((item): item is AptoideApp => Boolean(item)).slice(0, count)
}

export async function getAptoideApp(input: string | number): Promise<AptoideApp> {
  const raw = String(input).trim()
  if (!raw) throw new Error('Debes indicar una aplicación.')
  const selector = /^\d+$/.test(raw)
    ? `app_id=${encodeURIComponent(raw)}`
    : `package_name=${encodeURIComponent(raw)}`
  const payload = await fetchJson(`${META_BASE}/${selector}/aab=false`, 25_000)
  const app = parseApp(payload.data)
  if (!app) throw new Error('Aptoide no devolvió metadatos válidos para esa aplicación.')
  if (!app.apkUrl) throw new Error('Esta entrada no ofrece un APK directo compatible.')
  return app
}

export async function downloadAptoideApk(input: string | number): Promise<ApkDownloadResult> {
  const app = await getAptoideApp(input)
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-apk-'))
  const fileName = `${safeFileBase(app.name)}-${safeFileBase(app.version ?? 'latest')}.apk`
  const filePath = path.join(dir, fileName)

  try {
    const response = await fetch(app.apkUrl!, {
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'application/vnd.android.package-archive,application/octet-stream,*/*' },
      signal: AbortSignal.timeout(15 * 60_000),
    })
    if (!response.ok || !response.body) throw new Error(`El CDN de Aptoide respondió HTTP ${response.status}.`)
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > config.maxDownloadBytes) throw new Error(`La APK supera el límite configurado de ${config.maxDownloadMb} MB.`)

    let received = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length
        if (received > config.maxDownloadBytes) callback(new Error(`La APK supera el límite configurado de ${config.maxDownloadMb} MB.`))
        else callback(null, chunk)
      },
    })
    await pipeline(response.body, limiter, createWriteStream(filePath))
    const file = await stat(filePath)
    if (file.size < 1024) throw new Error('Aptoide devolvió un archivo APK vacío o inválido.')

    return {
      ...app,
      filePath,
      fileName,
      size: file.size,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}
