import { createHash } from 'node:crypto'
import { downloadLempiMedia } from './lempi-api.js'
import { requestLempiJson } from './lempi-client.js'
import type { LempiHappyModApp } from './lempi-media-endpoints.js'
import { resolveHappyModDirectUrl } from './media-download-fixes-v2.js'

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

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function normalizeUrl(value: unknown) {
  const text = stringValue(value)
  if (!text) return undefined
  try {
    const url = new URL(text.replace(/\\u0026/gi, '&').replace(/\\\//g, '/'))
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function normalizeOfficialResult(value: unknown): LempiHappyModApp | null {
  const record = asRecord(value)
  if (!record) return null

  const nombre = stringValue(record.nombre)
  const url = normalizeUrl(record.url)
  if (!nombre || !url) return null

  return {
    numero: numberValue(record.numero),
    nombre,
    version: stringValue(record.version),
    imagen: normalizeUrl(record.imagen),
    url,
    // El contrato oficial entrega el destino inicial en `url`. Puede ser un
    // archivo, un enlace corto o una página que debe resolverse al descargar.
    download: url,
  }
}

function parseOfficialResults(payload: unknown, limit?: number) {
  const root = asRecord(payload)
  const data = asRecord(root?.data)
  const resultados = Array.isArray(data?.resultados) ? data.resultados : []

  const apps = resultados
    .map(normalizeOfficialResult)
    .filter((item): item is LempiHappyModApp => Boolean(item))

  const unique = [...new Map(apps.map((item) => [item.url, item])).values()]
  return limit === undefined ? unique : unique.slice(0, limit)
}

function tokenFor(app: LempiHappyModApp) {
  return `hm_${createHash('sha256').update(app.url).digest('hex').slice(0, 16)}`
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

export async function searchHappyMod(query: string, limit?: number): Promise<HappyModItem[]> {
  const text = query.trim()
  if (text.length < 2) throw new Error('Escribe al menos 2 caracteres para buscar en HappyMod.')
  const max = limit === undefined ? undefined : Math.max(1, Math.trunc(limit))

  let payload: unknown
  try {
    payload = await requestLempiJson<unknown>(
      '/search/happymod',
      { text },
      { timeoutMs: SEARCH_TIMEOUT_MS },
    )
  } catch {
    throw new Error('No se pudo completar la búsqueda en este momento.')
  }

  const apps = parseOfficialResults(payload, max)
  if (!apps.length) throw new Error(`No encontré resultados para “${text}”.`)
  return apps.map(remember)
}

/**
 * Conserva la interfaz histórica, pero resuelve el destino real porque `url`
 * puede apuntar a una página o a un enlace corto antes del archivo final.
 */
export async function resolveHappyModApkUrl(item: HappyModItem): Promise<string> {
  const cached = getCached(item.token)
  try {
    const resolved = await resolveHappyModDirectUrl(cached.source.url)
    if (!resolved) throw new Error('unresolved')
    return resolved
  } catch {
    throw new Error('No se pudo preparar ese archivo en este momento.')
  }
}

export async function downloadHappyModApk(token: string): Promise<HappyModDownload> {
  const cached = getCached(token)
  try {
    const direct = await resolveHappyModDirectUrl(cached.source.url)
    if (!direct) throw new Error('unresolved')

    const result = await downloadLempiMedia(direct, {
      kind: 'document',
      baseName: `happymod-${cached.source.nombre}-${cached.source.version ?? 'mod'}`,
    })

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
