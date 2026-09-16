import { createHash } from 'node:crypto'
import {
  downloadLempiHappyModV2,
  searchLempiHappyModV2,
  type LempiHappyModApp,
} from './lempi-media-endpoints.js'

const CACHE_TTL_MS = 30 * 60_000

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

const cache = new Map<string, Cached>()

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
    summary: 'Resultado obtenido mediante LemPi /search/happymod.',
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
  const apps = await searchLempiHappyModV2(query, Math.max(1, Math.min(12, limit)))
  return apps.map(remember)
}

/**
 * Compatibilidad con la interfaz anterior. LemPi ya entrega el enlace directo de
 * descarga en /search/happymod, así que no se vuelve a rastrear happymod.com.
 */
export async function resolveHappyModApkUrl(item: HappyModItem): Promise<string> {
  return getCached(item.token).source.download
}

export async function downloadHappyModApk(token: string): Promise<HappyModDownload> {
  const cached = getCached(token)
  const result = await downloadLempiHappyModV2(cached.source)
  return {
    ...cached.item,
    filePath: result.filePath,
    fileName: result.fileName,
    size: result.size,
    cleanup: result.cleanup,
  }
}
