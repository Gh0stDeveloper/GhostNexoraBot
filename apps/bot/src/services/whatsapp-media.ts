import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { logger } from '../utils/logger.js'

export type WhatsAppMediaSource = Buffer | { url: string }

type PreloadOptions = {
  maxBytes?: number
  timeoutMs?: number
  label?: string
}

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 10_000

function localPathFromSource(source: string) {
  if (/^https?:\/\//i.test(source)) return null
  if (/^file:\/\//i.test(source)) {
    try { return fileURLToPath(source) } catch { return null }
  }
  return source
}

async function readLocalMedia(filePath: string, maxBytes: number) {
  const info = await stat(filePath)
  if (!info.isFile()) throw new Error('La fuente local no es un archivo.')
  if (info.size > maxBytes) throw new Error(`El medio local supera ${Math.floor(maxBytes / 1024 / 1024)} MB.`)
  return readFile(filePath)
}

async function fetchRemoteMedia(url: string, maxBytes: number, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  timer.unref?.()
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'GhostNexoraBot/1.1 WhatsAppMediaPreloader' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const announced = Number(response.headers.get('content-length') ?? 0)
    if (Number.isFinite(announced) && announced > maxBytes) {
      throw new Error(`El medio remoto supera ${Math.floor(maxBytes / 1024 / 1024)} MB.`)
    }

    if (!response.body) return Buffer.from(await response.arrayBuffer())
    const reader = response.body.getReader()
    const chunks: Buffer[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      total += chunk.length
      if (total > maxBytes) {
        try { await reader.cancel() } catch {}
        throw new Error(`El medio remoto supera ${Math.floor(maxBytes / 1024 / 1024)} MB.`)
      }
      chunks.push(chunk)
    }
    return Buffer.concat(chunks, total)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Materializa una ruta local o URL remota antes de entregarla a Baileys.
 *
 * Cuando la precarga funciona, Baileys recibe un Buffer y por tanto cifra/sube
 * el archivo a los servidores de WhatsApp antes del relay. Si una URL remota
 * no puede precargarse, conservamos el comportamiento compatible de Baileys
 * usando { url } como fallback. Las rutas locales no se exponen al destinatario.
 */
export async function preloadWhatsAppMedia(source: string | Buffer, options: PreloadOptions = {}): Promise<WhatsAppMediaSource> {
  if (Buffer.isBuffer(source)) return source
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const label = options.label ?? 'media'
  const localPath = localPathFromSource(source)

  if (localPath) {
    try {
      return await readLocalMedia(localPath, maxBytes)
    } catch (error) {
      logger.warn({ error, label, localPath }, 'local WhatsApp media preload failed; falling back to Baileys URL/path source')
      return { url: source }
    }
  }

  try {
    return await fetchRemoteMedia(source, maxBytes, timeoutMs)
  } catch (error) {
    let host: string | undefined
    try { host = new URL(source).hostname } catch {}
    logger.warn({ error, label, host }, 'remote WhatsApp media preload failed; falling back to Baileys URL source')
    return { url: source }
  }
}
