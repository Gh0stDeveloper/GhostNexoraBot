import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import { Transform } from 'node:stream'
import { config } from '../config.js'

export interface InstagramDownloadedImage {
  filePath: string
  fileName: string
  size: number
  sourceUrl: string
}

function validateUrl(input: string) {
  let url: URL
  try { url = new URL(input) } catch { throw new Error('URL de Instagram inválida.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se permiten URLs HTTP/HTTPS.')
  if (!/(^|\\.)instagram\\.com$/i.test(url.hostname)) throw new Error('La URL no pertenece a Instagram.')
  if (!/^\\/(?:p|reel|tv)\\//i.test(url.pathname)) throw new Error('Debes proporcionar la URL de una publicación de Instagram.')
  return url
}

function decodeEscaped(value: string) {
  return value
    .replace(/\\u0026/g, '&')
    .replace(/\\u003D/g, '=')
    .replace(/\\u002F/g, '/')
    .replace(/\\\\\//g, '/')
    .replace(/&amp;/g, '&')
}

function isInstagramImageUrl(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    const instagramCdn = host.endsWith('.cdninstagram.com') || host.endsWith('.fbcdn.net') || host.endsWith('.instagram.com')
    if (!instagramCdn) return false
    const target = `${url.pathname}${url.search}`.toLowerCase()
    if (/\\.(?:mp4|m3u8)(?:$|[?&])/i.test(target) || /\\/(?:video|videos)(?:\\/|$)/i.test(url.pathname)) return false
    return /\\.(?:jpe?g|png|webp)(?:$|[?&])/i.test(target) || /\\bscontent[-_]/i.test(host)
  } catch {
    return false
  }
}

function extractFromPostData(html: string) {
  const text = decodeEscaped(html)
  const values = new Set<string>()
  const marker = Math.min(...[
    text.indexOf('xdt_shortcode_media'),
    text.indexOf('edge_sidecar_to_children'),
    text.indexOf('carousel_media'),
    text.indexOf('image_versions2'),
  ].filter((index) => index >= 0))
  const context = Number.isFinite(marker) ? text.slice(marker, marker + 500_000) : ''

  const add = (raw: string) => {
    try {
      const url = decodeEscaped(raw)
      if (isInstagramImageUrl(url)) values.add(new URL(url).toString())
    } catch { /* ignore */ }
  }

  for (const match of context.matchAll(/"display_url"\\s*:\\s*"([^"]+)"/gi)) add(match[1] ?? '')
  for (const match of context.matchAll(/"src"\\s*:\\s*"([^"]+)"/gi)) add(match[1] ?? '')
  for (const match of context.matchAll(/"url"\\s*:\\s*"([^"]+)"/gi)) add(match[1] ?? '')

  return [...values]
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36 GhostNexoraBot/0.0.7c',
      referer: 'https://www.instagram.com/',
    },
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`Instagram respondió HTTP ${response.status}.`)
  const body = await response.text()
  if (!body.trim()) throw new Error('Instagram no devolvió contenido.')
  return body
}

async function resolvePostImages(original: URL) {
  const attempts = [original.toString()]
  const metadata = new URL(original.toString())
  metadata.search = ''
  metadata.searchParams.set('__a', '1')
  metadata.searchParams.set('__d', 'dis')
  attempts.push(metadata.toString())

  for (const candidate of attempts) {
    try {
      const html = await fetchText(candidate)
      const images = extractFromPostData(html)
      if (images.length) return images.slice(0, 10)
    } catch { /* try next public representation */ }
  }
  throw new Error('Instagram no expuso públicamente las imágenes de esa publicación. No se enviarán imágenes genéricas de portada.')
}

async function downloadOne(url: string, index: number, dir: string): Promise<InstagramDownloadedImage> {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0 GhostNexoraBot/0.0.7c',
      referer: 'https://www.instagram.com/',
    },
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok || !response.body) throw new Error(`No se pudo descargar la imagen ${index}: HTTP ${response.status}.`)
  const contentType = response.headers.get('content-type') ?? 'image/jpeg'
  if (!/^image\\//i.test(contentType)) throw new Error(`El recurso ${index} no es una imagen.`)
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const fileName = `instagram-${String(index).padStart(2, '0')}.${ext}`
  const filePath = path.join(dir, fileName)
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > config.maxDownloadBytes) throw new Error(`La imagen ${index} supera el límite configurado.`)
  let size = 0
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length
      callback(size > config.maxDownloadBytes ? new Error(`La imagen ${index} supera el límite configurado.`) : null, chunk)
    },
  })
  await pipeline(response.body, limiter, createWriteStream(filePath))
  if (size <= 0) throw new Error(`La imagen ${index} llegó vacía.`)
  return { filePath, fileName, size, sourceUrl: url }
}

export async function downloadInstagramImagesFromPost(input: string) {
  const original = validateUrl(input)
  const urls = await resolvePostImages(original)
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-instagram-images-'))
  try {
    const images: InstagramDownloadedImage[] = []
    for (const [index, url] of urls.entries()) {
      try { images.push(await downloadOne(url, index + 1, dir)) } catch { /* skip unavailable item */ }
    }
    if (!images.length) throw new Error('No se pudo descargar ninguna imagen de esa publicación.')
    return { images, cleanup: () => rm(dir, { recursive: true, force: true }) }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}
