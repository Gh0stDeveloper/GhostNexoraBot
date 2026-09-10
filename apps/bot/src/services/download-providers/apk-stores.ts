import { createHash } from 'node:crypto'
import { load } from 'cheerio'
import { downloadProviderFile, fetchProviderHtml, ProviderHttpSession } from './http.js'
import { withProviderTelemetry } from './runtime.js'

export type Phase3ApkStore = 'apkmirror' | 'apkpure'

export type Phase3ApkItem = {
  token: string
  store: Phase3ApkStore
  name: string
  pageUrl: string
  packageName?: string
  version?: string
  sizeLabel?: string
  icon?: string
}

export type Phase3ApkDirect = {
  store: Phase3ApkStore
  url: string
  referer: string
  extension: 'apk' | 'xapk' | 'apks'
  headers?: Record<string, string>
  waitMs?: number
}

const APKMIRROR_HOSTS = [/(^|\.)apkmirror\.com$/i]
const APKPURE_HOSTS = [/(^|\.)apkpure\.net$/i]
const APKPURE_DOWNLOAD_HOSTS = [/^d\.apkpure\.net$/i, /(^|\.)apkpure\.net$/i]
const CACHE_TTL_MS = 30 * 60_000
const MAX_RESULTS = 8
const cache = new Map<string, { item: Phase3ApkItem; expiresAt: number }>()

function absolute(base: string, value?: string | null) {
  if (!value) return undefined
  try { return new URL(value, base).toString() } catch { return undefined }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function normalize(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim().replace(/\s+/g, ' ')
}

function terms(value: string) {
  return normalize(value).split(/[ .]+/).filter((part) => part.length >= 2)
}

function relevance(query: string, name: string, extra = '') {
  const q = normalize(query)
  const haystack = normalize(`${name} ${extra}`)
  if (!q || !haystack) return -1
  const parts = terms(query)
  if (parts.length && !parts.every((part) => haystack.includes(part))) return -1
  let score = haystack.includes(q) ? 100 : 0
  if (normalize(name) === q) score += 200
  if (normalize(name).startsWith(q)) score += 80
  for (const part of parts) if (normalize(name).includes(part)) score += 20
  return score
}

function remember(store: Phase3ApkStore, input: Omit<Phase3ApkItem, 'token' | 'store'>) {
  const prefix = store === 'apkmirror' ? 'am' : 'ap'
  const token = `${prefix}_${createHash('sha256').update(`${store}:${input.pageUrl}`).digest('hex').slice(0, 18)}`
  const item: Phase3ApkItem = { token, store, ...input }
  cache.set(token, { item, expiresAt: Date.now() + CACHE_TTL_MS })
  return item
}

export function getPhase3ApkItem(token: string, expected?: Phase3ApkStore) {
  const key = token.trim()
  const row = cache.get(key)
  if (!row || row.expiresAt <= Date.now()) {
    cache.delete(key)
    throw new Error('Ese resultado expiró. Repite la búsqueda de la tienda.')
  }
  if (expected && row.item.store !== expected) throw new Error('Ese resultado pertenece a otra tienda.')
  return row.item
}

export function apkMirrorSearchUrl(query: string) {
  const endpoint = new URL('https://www.apkmirror.com/')
  endpoint.searchParams.set('post_type', 'app_release')
  endpoint.searchParams.set('searchtype', 'apk')
  endpoint.searchParams.set('s', query)
  return endpoint.toString()
}

export function parseApkMirrorSearchHtml(query: string, html: string, baseUrl = 'https://www.apkmirror.com/') {
  const $ = load(html)
  const found = new Map<string, Omit<Phase3ApkItem, 'token' | 'store'>>()
  $('a[href]').each((_index, element) => {
    const pageUrl = absolute(baseUrl, $(element).attr('href'))
    if (!pageUrl) return
    let url: URL
    try { url = new URL(pageUrl) } catch { return }
    if (!APKMIRROR_HOSTS.some((pattern) => pattern.test(url.hostname))) return
    if (!/^\/apk\/[^/]+\/[^/]+\/[^/]+-release\/?$/i.test(url.pathname)) return

    const box = $(element).closest('article,.appRow,.listWidget,.row,div').first()
    const rawName = ($(element).text() || box.find('h4,h5,.appRowTitle,.fontBlack').first().text()).replace(/\s+/g, ' ').trim()
    const name = rawName.replace(/\s+APK$/i, '').trim().slice(0, 100)
    const text = box.text().replace(/\s+/g, ' ').trim()
    if (relevance(query, name, `${text} ${url.pathname}`) < 0) return
    const version = /\bVersion:\s*([^\s]+(?:\s+beta)?)/i.exec(text)?.[1]
    const sizeLabel = /\bFile size:\s*([0-9.,]+\s*(?:KB|MB|GB))/i.exec(text)?.[1]
    const icon = absolute(baseUrl, box.find('img').first().attr('data-src') || box.find('img').first().attr('src'))
    found.set(pageUrl, { name: name || url.pathname.split('/').filter(Boolean).at(-1) || 'APKMirror', pageUrl, version, sizeLabel, icon })
  })

  return [...found.values()]
    .sort((a, b) => relevance(query, b.name, b.pageUrl) - relevance(query, a.name, a.pageUrl))
    .slice(0, MAX_RESULTS)
}

export async function searchApkMirror(query: string) {
  const clean = query.trim().slice(0, 120)
  if (clean.length < 2) throw new Error('Indica una aplicación para buscar en APKMirror.')
  return withProviderTelemetry('apkmirror-html', 'search', async () => {
    const endpoint = apkMirrorSearchUrl(clean)
    const page = await fetchProviderHtml(endpoint, APKMIRROR_HOSTS)
    const parsed = parseApkMirrorSearchHtml(clean, page.html, page.finalUrl)
    if (!parsed.length) throw new Error('APKMirror no devolvió releases compatibles con esa búsqueda.')
    return parsed.map((item) => remember('apkmirror', item))
  })
}

function apkPurePackageFromUrl(value: string) {
  try {
    const parts = new URL(value).pathname.split('/').filter(Boolean)
    return [...parts].reverse().find((part) => /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+){1,}$/.test(part))
  } catch { return undefined }
}

export function apkPureLookupUrl(query: string) {
  const endpoint = new URL('https://apkpure.net/es/apk-downloader')
  endpoint.searchParams.set('p', query)
  return endpoint.toString()
}

export function parseApkPureLookupHtml(query: string, html: string, baseUrl: string) {
  const $ = load(html)
  const found = new Map<string, Omit<Phase3ApkItem, 'token' | 'store'>>()

  const add = (pageUrl: string, rawName?: string, boxText = '', icon?: string) => {
    const packageName = apkPurePackageFromUrl(pageUrl)
    if (!packageName) return
    const url = new URL(pageUrl)
    if (!APKPURE_HOSTS.some((pattern) => pattern.test(url.hostname))) return
    if (/\/download(?:\/|$)/i.test(url.pathname) || /\/apk-downloader(?:\/|$)/i.test(url.pathname)) return
    const name = (rawName || packageName).replace(/\s+/g, ' ').trim().slice(0, 100)
    if (relevance(query, name, `${packageName} ${boxText}`) < 0) return
    const version = /\b(?:Version|Versi[oó]n)\s*[: ]\s*([^\s]+)/i.exec(boxText)?.[1]
    const sizeLabel = /\b([0-9.,]+\s*(?:KB|MB|GB))\b/i.exec(boxText)?.[1]
    found.set(pageUrl, { name, pageUrl, packageName, version, sizeLabel, icon })
  }

  const finalPackage = apkPurePackageFromUrl(baseUrl)
  if (finalPackage && !/\/apk-downloader(?:\/|$)/i.test(new URL(baseUrl).pathname)) {
    add(baseUrl, $('h1').first().text() || finalPackage, $('body').text().replace(/\s+/g, ' ').slice(0, 2000), absolute(baseUrl, $('img').first().attr('src')))
  }

  $('a[href]').each((_index, element) => {
    const pageUrl = absolute(baseUrl, $(element).attr('href'))
    if (!pageUrl) return
    const box = $(element).closest('article,li,.search-dl,.search-template,.apk-list,.app,div').first()
    const name = ($(element).attr('title') || box.find('h2,h3,.title,.name').first().text() || $(element).text()).replace(/\s+/g, ' ').trim()
    const text = box.text().replace(/\s+/g, ' ').trim().slice(0, 500)
    const icon = absolute(baseUrl, box.find('img').first().attr('data-src') || box.find('img').first().attr('src'))
    add(pageUrl, name, text, icon)
  })

  return [...found.values()]
    .sort((a, b) => relevance(query, b.name, `${b.packageName ?? ''} ${b.pageUrl}`) - relevance(query, a.name, `${a.packageName ?? ''} ${a.pageUrl}`))
    .slice(0, MAX_RESULTS)
}

export async function searchApkPure(query: string) {
  const clean = query.trim().slice(0, 120)
  if (clean.length < 2) throw new Error('Indica una aplicación o package para buscar en APKPure.')
  return withProviderTelemetry('apkpure-html', 'search', async () => {
    const endpoint = apkPureLookupUrl(clean)
    const page = await fetchProviderHtml(endpoint, APKPURE_HOSTS)
    const parsed = parseApkPureLookupHtml(clean, page.html, page.finalUrl)
    if (!parsed.length) throw new Error('APKPure no devolvió aplicaciones compatibles con esa búsqueda.')
    return parsed.map((item) => remember('apkpure', item))
  })
}

export function findApkMirrorVariantUrl(html: string, baseUrl: string) {
  const $ = load(html)
  const candidates = $('a[href]')
    .map((_index, element) => {
      const href = absolute(baseUrl, $(element).attr('href'))
      const text = $(element).text().replace(/\s+/g, ' ').trim()
      return href && /-android-apk-download\/?(?:[?#].*)?$/i.test(href) ? { href, text } : null
    })
    .get()
    .filter(Boolean) as Array<{ href: string; text: string }>
  return candidates.find((item) => /\bAPK\b/i.test(item.text))?.href ?? candidates[0]?.href
}

export function findApkMirrorIntermediateUrl(html: string, baseUrl: string) {
  const $ = load(html)
  const candidates = $('a[href]')
    .map((_index, element) => {
      const href = absolute(baseUrl, $(element).attr('href'))
      if (!href) return null
      const parsed = new URL(href)
      if (!parsed.pathname.endsWith('/download/') || !parsed.searchParams.has('key')) return null
      const text = $(element).text().replace(/\s+/g, ' ').trim()
      return { href, text }
    })
    .get()
    .filter(Boolean) as Array<{ href: string; text: string }>
  return candidates.find((item) => /download\s+apk/i.test(item.text))?.href ?? candidates[0]?.href
}

/**
 * APKMirror muestra actualmente un contador antes de habilitar el enlace
 * `/download/?...&key=...`. El key ya está en el DOM, pero el servidor puede
 * rechazarlo si se consume antes de que termine el contador.
 */
export function apkMirrorRequiredWaitMs(html: string) {
  const text = load(html).text().replace(/\s+/g, ' ').trim()
  const candidates = [
    /wait\s+(\d{1,2})\s+(?:more\s+)?sec(?:ond)?s?/i,
    /(?:countdown|counter|seconds?)\s*[:=]\s*["']?(\d{1,2})/i,
  ]
  for (const pattern of candidates) {
    const match = pattern.exec(`${text}\n${html}`)
    const seconds = Number(match?.[1] ?? 0)
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, 30) * 1000 + 1250
  }
  return 0
}

export function findApkMirrorSignedDownloadUrl(html: string, baseUrl: string) {
  const $ = load(html)
  const preferred = $('a#download-link[href]').first().attr('href')
  const fallback = $('a[href*="/wp-content/themes/APKMirror/download.php"]').first().attr('href')
  const direct = preferred || fallback
  if (!direct) return undefined
  const absoluteUrl = absolute(baseUrl, direct)
  if (!absoluteUrl) return undefined
  const parsed = new URL(absoluteUrl)
  if (!parsed.pathname.includes('/wp-content/themes/APKMirror/download.php')) return undefined
  if (!parsed.searchParams.get('id') || !parsed.searchParams.get('key')) return undefined
  return parsed.toString()
}

function retryableApkMirrorError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /HTTP\s+(?:403|429)|anti-bot|cloudflare|access denied/i.test(message)
}

async function resolveApkMirrorSignedUrl(item: Phase3ApkItem) {
  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const session = new ProviderHttpSession()
    try {
      let variantUrl = /-android-apk-download\/?$/i.test(new URL(item.pageUrl).pathname) ? item.pageUrl : undefined
      let variantReferer = item.pageUrl
      if (!variantUrl) {
        const release = await session.fetchHtml(item.pageUrl, APKMIRROR_HOSTS)
        variantUrl = findApkMirrorVariantUrl(release.html, release.finalUrl)
        variantReferer = release.finalUrl
      } else {
        variantReferer = new URL('../', variantUrl).toString()
      }
      if (!variantUrl) throw new Error('APKMirror no expuso una variante APK descargable.')

      const variant = await session.fetchHtml(variantUrl, APKMIRROR_HOSTS, { referer: variantReferer })
      const intermediateUrl = findApkMirrorIntermediateUrl(variant.html, variant.finalUrl)
      if (!intermediateUrl) throw new Error('APKMirror no expuso el enlace intermedio firmado.')

      const waitMs = apkMirrorRequiredWaitMs(variant.html)
      if (waitMs > 0) await sleep(waitMs)

      const intermediate = await session.fetchHtml(intermediateUrl, APKMIRROR_HOSTS, { referer: variant.finalUrl })
      const signed = findApkMirrorSignedDownloadUrl(intermediate.html, intermediate.finalUrl)
      if (!signed) throw new Error('APKMirror no expuso download.php con id y key vigentes.')

      const headers = session.headersFor(signed, {
        referer: intermediate.finalUrl,
        navigation: true,
        accept: 'application/vnd.android.package-archive,application/zip,application/octet-stream,*/*',
      })
      return { signed, referer: intermediate.finalUrl, headers, waitMs }
    } catch (error) {
      lastError = error
      if (attempt >= 2 || !retryableApkMirrorError(error)) throw error
      await sleep(1750)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('APKMirror no pudo completar el flujo firmado.')
}

export function findApkPureDirectUrl(html: string, baseUrl: string) {
  const $ = load(html)
  const links = $('a[href]')
    .map((_index, element) => {
      const href = absolute(baseUrl, $(element).attr('href'))
      const text = $(element).text().replace(/\s+/g, ' ').trim()
      return href && /^https:\/\/d\.apkpure\.net\//i.test(href) ? { href, text } : null
    })
    .get()
    .filter(Boolean) as Array<{ href: string; text: string }>
  return links.find((item) => /descargar|download|reiniciar|click/i.test(item.text))?.href ?? links[0]?.href
}

function packageExtension(url: string, html = ''): 'apk' | 'xapk' | 'apks' {
  const pathname = new URL(url).pathname.toLowerCase()
  if (pathname.endsWith('.xapk')) return 'xapk'
  if (pathname.endsWith('.apks')) return 'apks'
  if (pathname.endsWith('.apk')) return 'apk'
  if (/\b(?:file format|formato de archivo)\s*XAPK\b/i.test(html)) return 'xapk'
  return 'apk'
}

export async function resolvePhase3ApkDirect(item: Phase3ApkItem): Promise<Phase3ApkDirect> {
  if (item.store === 'apkmirror') {
    const { signed, referer, headers, waitMs } = await resolveApkMirrorSignedUrl(item)
    return { store: item.store, url: signed, referer, extension: 'apk', headers, waitMs }
  }

  const session = new ProviderHttpSession()
  const detailPath = new URL(item.pageUrl)
  detailPath.hash = ''
  detailPath.search = ''
  detailPath.pathname = `${detailPath.pathname.replace(/\/+$/, '')}/download`
  const page = await session.fetchHtml(detailPath.toString(), APKPURE_HOSTS, { referer: item.pageUrl })
  const direct = findApkPureDirectUrl(page.html, page.finalUrl)
  if (!direct) throw new Error('APKPure no expuso su enlace firmado d.apkpure.net en la página de descarga.')
  return {
    store: item.store,
    url: direct,
    referer: page.finalUrl,
    extension: packageExtension(direct, page.html),
    headers: session.headersFor(direct, {
      referer: page.finalUrl,
      navigation: true,
      accept: 'application/vnd.android.package-archive,application/zip,application/octet-stream,*/*',
    }),
  }
}

export async function downloadPhase3Apk(token: string) {
  const item = getPhase3ApkItem(token)
  const direct = await withProviderTelemetry(item.store === 'apkmirror' ? 'apkmirror-html' : 'apkpure-html', 'resolve', () => resolvePhase3ApkDirect(item))
  const allowedHosts = item.store === 'apkmirror' ? APKMIRROR_HOSTS : APKPURE_DOWNLOAD_HOSTS
  const provider = item.store === 'apkmirror' ? 'APKMirror' : 'APKPure'
  return withProviderTelemetry(item.store === 'apkmirror' ? 'apkmirror-html' : 'apkpure-html', 'download', async () => {
    const file = await downloadProviderFile(direct.url, {
      allowedHosts,
      provider,
      fileBase: `${item.name}-${item.version ?? 'latest'}`,
      extension: direct.extension,
      referer: direct.referer,
      headers: direct.headers,
      requireZipMagic: true,
    })
    return {
      ...file,
      store: item.store,
      item,
      packageKind: direct.extension.toUpperCase() as 'APK' | 'XAPK' | 'APKS',
    }
  })
}
