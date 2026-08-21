import { load } from 'cheerio'
import { config } from '../config.js'

export interface MediaFireDownload {
  buffer: Buffer
  fileName: string
  contentType: string
}

function assertMediaFireUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('URL de MediaFire inválida.')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL de MediaFire inválida.')
  const host = url.hostname.toLowerCase()
  if (!(host === 'mediafire.com' || host.endsWith('.mediafire.com'))) {
    throw new Error('El enlace debe pertenecer a mediafire.com.')
  }
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
  const pageResponse = await fetch(pageUrl, {
    headers: { 'user-agent': 'Mozilla/5.0 GhostNexoraBot/1.0' },
    redirect: 'follow',
  })
  if (!pageResponse.ok) throw new Error(`MediaFire respondió HTTP ${pageResponse.status}.`)
  const html = await pageResponse.text()
  const $ = load(html)
  const href = $('a#downloadButton').attr('href') ?? $('a.input.popsok').attr('href')
  if (!href) throw new Error('No se encontró el enlace público de descarga de MediaFire.')

  const directUrl = assertMediaFireUrl(href)
  const response = await fetch(directUrl, {
    headers: { 'user-agent': 'Mozilla/5.0 GhostNexoraBot/1.0' },
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`La descarga de MediaFire respondió HTTP ${response.status}.`)

  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > config.maxDownloadBytes) {
    throw new Error(`El archivo supera el límite configurado de ${config.maxDownloadMb} MB.`)
  }
  if (!response.body) throw new Error('MediaFire no entregó contenido.')

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > config.maxDownloadBytes) {
      await reader.cancel()
      throw new Error(`El archivo supera el límite configurado de ${config.maxDownloadMb} MB.`)
    }
    chunks.push(value)
  }

  return {
    buffer: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
    fileName: fileNameFromResponse(new URL(response.url), response.headers.get('content-disposition')),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
  }
}
