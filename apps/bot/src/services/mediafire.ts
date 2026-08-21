import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { load } from 'cheerio'
import { config } from '../config.js'

export interface MediaFireDownload {
  filePath: string
  fileName: string
  contentType: string
  size: number
  cleanup: () => Promise<void>
}

function assertMediaFireUrl(value: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('URL de MediaFire inválida.') }
  const host = url.hostname.toLowerCase()
  if (!['http:', 'https:'].includes(url.protocol) || !(host === 'mediafire.com' || host.endsWith('.mediafire.com'))) throw new Error('El enlace debe pertenecer a mediafire.com.')
  return url
}

function fileNameFromResponse(url: URL, disposition: string | null) {
  const utf8Match = disposition?.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1])
  const plainMatch = disposition?.match(/filename="?([^";]+)"?/i)
  if (plainMatch?.[1]) return plainMatch[1]
  return decodeURIComponent(url.pathname.split('/').pop() || 'mediafire-download')
}

export async function downloadMediaFire(input: string): Promise<MediaFireDownload> {
  const pageUrl = assertMediaFireUrl(input)
  const pageResponse = await fetch(pageUrl, { headers: { 'user-agent': 'Mozilla/5.0 GhostNexoraBot/1.0' }, redirect: 'follow' })
  if (!pageResponse.ok) throw new Error(`MediaFire respondió HTTP ${pageResponse.status}.`)
  const $ = load(await pageResponse.text())
  const href = $('a#downloadButton').attr('href') ?? $('a.input.popsok').attr('href')
  if (!href) throw new Error('No se encontró el enlace público de descarga de MediaFire.')
  const directUrl = assertMediaFireUrl(href)
  const response = await fetch(directUrl, { headers: { 'user-agent': 'Mozilla/5.0 GhostNexoraBot/1.0' }, redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`La descarga de MediaFire respondió HTTP ${response.status}.`)
  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > config.maxDownloadBytes) throw new Error(`El archivo supera el límite de ${config.maxDownloadMb} MB.`)

  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-mediafire-'))
  const fileName = fileNameFromResponse(new URL(response.url), response.headers.get('content-disposition')).replace(/[\\/:*?"<>|]/g, '_')
  const filePath = path.join(dir, fileName)
  let total = 0
  const source = Readable.fromWeb(response.body as never)
  source.on('data', (chunk: Buffer) => {
    total += chunk.length
    if (total > config.maxDownloadBytes) source.destroy(new Error(`El archivo supera el límite de ${config.maxDownloadMb} MB.`))
  })
  try {
    await pipeline(source, createWriteStream(filePath, { mode: 0o600 }))
    const size = (await stat(filePath)).size
    return { filePath, fileName, size, contentType: response.headers.get('content-type') ?? 'application/octet-stream', cleanup: () => rm(dir, { recursive: true, force: true }) }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}
