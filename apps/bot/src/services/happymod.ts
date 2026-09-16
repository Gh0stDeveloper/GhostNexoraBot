import { createHash } from 'node:crypto'
import { downloadLempiHappyModV2, type LempiHappyModApp } from './lempi-media-endpoints.js'
import { requestLempiJson } from './lempi-client.js'

const CACHE_TTL_MS = 30 * 60_000
const SEARCH_TIMEOUT_MS = 90_000

export type HappyModItem = {
  token: string
  name: string
  url: string
  icon?: string
  version?: string
  sizeLabel?: string
  category?: string
  summary?: string
}

export type HappyModDownload = HappyModItem & {
  filePath: string
  fileName: string
  size: number
  cleanup: () => Promise<void>
}

type Cached = {
  item: HappyModItem
  source: LempiHappyModApp
  expiresAt: number
}

type JsonRecord = Record<string, unknown>

const cache = new Map<string, Cached>()

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value)
    if (text) return text
  }
  return undefined
}

function normalizeUrl(value: unknown) {
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

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return undefined
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

function findNestedDownload(record: JsonRecord) {
  let direct: string | undefined
  const visit = (value: unknown, key = '', depth = 0) => {
    if (direct || depth > 5 || value === null || value === undefined) return
    if (typeof value === 'string') {
      if (/download|descarga|apk|file|direct|url_download|download_url|link_download/i.test(key)) {
        direct = normalizeUrl(value)
      }
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key, depth + 1)
      return
    }
    const nested = asRecord(value)
    if (!nested) return
    for (const [nestedKey, child] of Object.entries(nested)) visit(child, nestedKey, depth + 1)
  }
  visit(record)
  return direct
}

function normalizeApp(record: JsonRecord): LempiHappyModApp | null {
  const nombre = firstString(
    record.nombre,
    record.name,
    record.title,
    record.app,
    record.appName,
    record.app_name,
  )
  if (!nombre) return null

  const explicitDownload = normalizeUrl(
    record.download
      ?? record.descarga
      ?? record.apk
      ?? record.apk_url
      ?? record.apkUrl
      ?? record.direct
      ?? record.download_url
      ?? record.downloadUrl
      ?? record.url_download
      ?? record.urlDownload
      ?? record.link_download
      ?? record.linkDownload
      ?? record.file_url
      ?? record.fileUrl,
  ) ?? findNestedDownload(record)

  // Este buscador históricamente devuelve el enlace utilizable en `url`.
  // Cuando existe un campo de descarga explícito se prefiere; de lo contrario
  // `url`/`link` se conserva como destino descargable en vez de descartar el resultado.
  const pageOrDirect = normalizeUrl(record.url ?? record.link ?? record.page ?? record.source)
  const download = explicitDownload ?? pageOrDirect
  if (!download) return null

  return {
    numero: firstNumber(record.numero, record.number, record.id),
    nombre,
    version: firstString(record.version, record.ver, record.appVersion, record.app_version),
    imagen: normalizeUrl(record.imagen ?? record.image ?? record.icon ?? record.logo ?? record.thumbnail),
    url: pageOrDirect ?? download,
    download,
  }
}

function parseApps(payload: unknown, limit: number) {
  const rows: LempiHappyModApp[] = []
  walkRecords(payload, (record) => {
    const app = normalizeApp(record)
    if (app) rows.push(app)
  })
  return [...new Map(rows.map((app) => [app.download, app])).values()].slice(0, limit)
}

function tokenFor(app: LempiHappyModApp) {
  return `hm_${createHash('sha256').update(app.download).digest('hex').slice(0, 16)}`
}

function remember(app: LempiHappyModApp) {
  const token = tokenFor(app)
  const item: HappyModItem = {
    token,
    name: app.nombre,
    url: app.url,
    icon: app.imagen,
    version: app.version,
  }
  cache.set(token, { item, source: app, expiresAt: Date.now() + CACHE_TTL_MS })
  return item
}

function getCached(token: string) {
  const key = token.trim()
  const value = cache.get(key)
  if (!value || value.expiresAt <= Date.now()) {
    cache.delete(key)
    throw new Error('Ese resultado de HappyMod expiró. Vuelve a ejecutar .happymod <búsqueda>.')
  }
  return value
}

export function getHappyModItem(token: string): HappyModItem {
  return getCached(token).item
}

export async function searchHappyMod(query: string, limit = 10): Promise<HappyModItem[]> {
  const text = query.trim()
  if (text.length < 2) throw new Error('Escribe al menos 2 caracteres para buscar en HappyMod.')
  const max = Math.max(1, Math.min(12, limit))
  const variants = [
    { q: text, limit: max },
    { query: text, limit: max },
    { search: text, limit: max },
  ]

  for (const params of variants) {
    try {
      const payload = await requestLempiJson<unknown>('/search/happymod', params, { timeoutMs: SEARCH_TIMEOUT_MS })
      const apps = parseApps(payload, max)
      if (apps.length) return apps.map(remember)
    } catch {
      // Try the next accepted search parameter before reporting a generic failure.
    }
  }

  throw new Error(`No encontré resultados para “${text}”.`)
}

/**
 * Compatibilidad con la interfaz anterior. El buscador ya entrega el enlace
 * necesario para iniciar la descarga, por lo que no se rastrea la página web.
 */
export async function resolveHappyModApkUrl(item: HappyModItem): Promise<string> {
  return getCached(item.token).source.download
}

export async function downloadHappyModApk(token: string): Promise<HappyModDownload> {
  const cached = getCached(token)
  try {
    const result = await downloadLempiHappyModV2(cached.source)
    return {
      ...cached.item,
      filePath: result.filePath,
      fileName: result.fileName,
      size: result.size,
      cleanup: result.cleanup,
    }
  } catch {
    throw new Error('No se pudo descargar ese archivo en este momento.')
  }
}
