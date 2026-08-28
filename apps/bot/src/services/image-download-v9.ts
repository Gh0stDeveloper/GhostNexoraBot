import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import { Transform } from 'node:stream'
import * as cheerio from 'cheerio'
import { config } from '../config.js'

export type ImageSource = 'instagram' | 'pinterest'

export interface DownloadedImage {
  filePath: string
  fileName: string
  size: number
  sourceUrl: string
}

const sourceHosts: Record<ImageSource, string[]> = {
  instagram: ['instagram.com', 'www.instagram.com'],
  pinterest: ['pinterest.com', 'www.pinterest.com', 'pin.it'],
}

function assertSourceUrl(value: string, source: ImageSource) {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('URL inválida.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se permiten URLs HTTP/HTTPS.')
  const host = url.hostname.toLowerCase()
  if (!sourceHosts[source].some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    throw new Error(`La URL no pertenece a ${source}.`)
  }
  return url.toString()
}

function decodeEscaped(value: string) {
  return value
    .replace(/\\u0026/g, '&')
    .replace(/\\u003D/g, '=')
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
}

function imageCandidatesFromHtml(html: string) {
  const values = new Set<string>()
  const patterns = [
    /property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /content=["']([^"']+)["'][^>]+property=["']og:image["']/gi,
    /(?:display_url|image_url|orig|url)["']?\s*:\s*["'](https?:\\?\/\\?\/[^"'\\ ]+)["']/gi,
    /https?:\\?\/\\?\/[^"'\\ ]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\\ ]*)?/gi,
  ]
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = decodeEscaped(match[1] ?? match[0] ?? '')
      try {
        const url = new URL(raw)
        if (url.protocol === 'http:' || url.protocol === 'https:') values.add(url.toString())
      } catch { /* ignore malformed candidates */ }
    }
  }
  return [...values]
}

function normalizeSearchTerm(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((term) => term.length >= 2)
}

function isPinterestContentImage(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (!(host === 'i.pinimg.com' || host.endsWith('.pinimg.com'))) return false
    const pathName = url.pathname.toLowerCase()
    if (/\/(?:avatars?|profile|profiles|logos?|favicon|favicons|static|pinclips?)\//i.test(pathName)) return false
    if (!/\.(?:jpe?g|png|webp|gif)$/i.test(pathName)) return false
    return true
  } catch {
    return false
  }
}

function pinterestSearchImageCandidates(html: string, query: string) {
  const $ = cheerio.load(html)
  const terms = normalizeSearchTerm(query)
  const ranked: Array<{ url: string; score: number; order: number }> = []
  const seen = new Set<string>()
  let order = 0

  $('a[href]').each((_index, element) => {
    const hrefRaw = $(element).attr('href') ?? ''
    let href: URL
    try { href = new URL(hrefRaw, 'https://www.pinterest.com/') } catch { return }
    if (!/(^|\.)pinterest\.com$/i.test(href.hostname) || !/^\/pin(?:\/|$)/i.test(href.pathname)) return

    const metadata = [
      $(element).attr('aria-label'),
      $(element).attr('title'),
      $(element).text(),
      $(element).find('img').map((_i, img) => $(img).attr('alt')).get().join(' '),
    ].filter(Boolean).join(' ')
    const normalizedMetadata = normalizeSearchTerm(metadata)
    const score = terms.reduce((total, term) => total + (normalizedMetadata.includes(term) ? 1 : 0), 0)

    $(element).find('img').each((_imgIndex, img) => {
      const rawCandidates = [
        $(img).attr('data-src'),
        $(img).attr('data-lazy-src'),
        $(img).attr('src'),
        ...String($(img).attr('srcset') ?? '').split(',').map((entry) => entry.trim().split(/\s+/)[0]).filter((value): value is string => Boolean(value)),
      ].filter((value): value is string => Boolean(value))
      for (const raw of rawCandidates) {
        try {
          const imageUrl = new URL(decodeEscaped(raw), href.origin).toString()
          if (!isPinterestContentImage(imageUrl) || seen.has(imageUrl)) continue
          seen.add(imageUrl)
          ranked.push({ url: imageUrl, score, order: order++ })
        } catch { /* skip malformed image */ }
      }
    })
  })

  ranked.sort((a, b) => b.score - a.score || a.order - b.order)
  const urls = ranked.map((item) => item.url)
  const relevant = ranked.filter((item) => item.score > 0).map((item) => item.url)
  return [...new Set(relevant.length ? relevant : urls)].slice(0, 10)
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36 GhostNexoraBot/0.0.7c',
    },
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`La página respondió HTTP ${response.status}.`)
  const html = await response.text()
  if (!html.trim()) throw new Error('La página no devolvió contenido.')
  return html
}

async function downloadOne(url: string, index: number, source: ImageSource, dir: string): Promise<DownloadedImage> {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'Mozilla/5.0 GhostNexoraBot/0.0.7c', referer: source === 'instagram' ? 'https://www.instagram.com/' : 'https://www.pinterest.com/' },
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok || !response.body) throw new Error(`No se pudo descargar la imagen ${index}: HTTP ${response.status}.`)
  const contentType = response.headers.get('content-type') ?? 'image/jpeg'
  if (!/^image\//i.test(contentType)) throw new Error(`La fuente ${index} no devolvió una imagen.`)
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : contentType.includes('gif') ? 'gif' : 'jpg'
  const fileName = `${source}-${String(index).padStart(2, '0')}.${ext}`
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

async function downloadImageSet(source: ImageSource, urls: string[]) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-images-'))
  try {
    const images: DownloadedImage[] = []
    for (let i = 0; i < urls.length && images.length < 10; i += 1) {
      try { images.push(await downloadOne(urls[i]!, images.length + 1, source, dir)) } catch { /* skip broken item */ }
    }
    if (!images.length) throw new Error('No se pudo obtener ninguna imagen disponible.')
    return { images, cleanup: () => rm(dir, { recursive: true, force: true }) }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}

export async function downloadInstagramImages(input: string) {
  const url = assertSourceUrl(input, 'instagram')
  const html = await fetchHtml(url)
  const urls = imageCandidatesFromHtml(html).slice(0, 10)
  return downloadImageSet('instagram', urls)
}

export async function downloadPinterestImages(input: string) {
  const url = assertSourceUrl(input, 'pinterest')
  const html = await fetchHtml(url)
  const urls = imageCandidatesFromHtml(html).filter(isPinterestContentImage).slice(0, 10)
  return downloadImageSet('pinterest', urls)
}

export async function searchPinterestImages(query: string) {
  const normalized = query.trim()
  if (!normalized) throw new Error('Debes indicar qué quieres buscar en Pinterest.')
  const searchUrl = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(normalized)}`
  const html = await fetchHtml(searchUrl)
  return pinterestSearchImageCandidates(html, normalized)
}
