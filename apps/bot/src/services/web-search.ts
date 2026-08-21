import { load } from 'cheerio'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export type WebSearchResult = {
  title: string
  url: string
  snippet?: string
  thumbnail?: string
}

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function googleTarget(href: string) {
  try {
    const url = new URL(href, 'https://www.google.com')
    if (url.pathname === '/url') {
      const target = url.searchParams.get('q') ?? url.searchParams.get('url')
      if (!target) return null
      const parsed = new URL(target)
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null
    }
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const host = url.hostname.toLowerCase()
    if (host === 'google.com' || host.endsWith('.google.com')) return null
    return url.toString()
  } catch {
    return null
  }
}

export async function googleSearch(query: string, limit = 8): Promise<WebSearchResult[]> {
  const text = query.trim()
  if (!text) throw new Error('Indica qué deseas buscar en Google.')
  const endpoint = new URL('https://www.google.com/search')
  endpoint.searchParams.set('q', text)
  endpoint.searchParams.set('hl', 'es')
  endpoint.searchParams.set('gl', 'mx')
  endpoint.searchParams.set('num', String(Math.max(5, Math.min(10, limit + 2))))
  endpoint.searchParams.set('filter', '0')

  const response = await fetch(endpoint, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'es-MX,es;q=0.9,en;q=0.7',
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Google respondió HTTP ${response.status}.`)
  const html = await response.text()
  if (/unusual traffic|detected unusual traffic|recaptcha/i.test(html)) throw new Error('Google activó una verificación anti-bot para la IP de esta VPS. Intenta nuevamente más tarde.')
  const $ = load(html)
  const found = new Map<string, WebSearchResult>()

  $('a').each((_, element) => {
    if (found.size >= Math.max(1, Math.min(10, limit))) return
    const anchor = $(element)
    const heading = anchor.find('h3').first()
    if (!heading.length) return
    const url = googleTarget(anchor.attr('href') ?? '')
    if (!url || found.has(url)) return
    const title = cleanText(heading.text())
    if (!title) return
    const box = anchor.closest('.MjjYud').length ? anchor.closest('.MjjYud') : anchor.parent().parent()
    const snippet = cleanText(box.find('.VwiC3b, .aCOpRe, .IsZvec').first().text()) || undefined
    found.set(url, { title: title.slice(0, 180), url, snippet: snippet?.slice(0, 500) })
  })

  if (!found.size) throw new Error('Google no devolvió resultados analizables. Puede haber activado una protección temporal para la VPS.')
  return [...found.values()]
}

type WikipediaPage = {
  pageid?: number
  ns?: number
  title?: string
  extract?: string
  fullurl?: string
  index?: number
  thumbnail?: { source?: string }
}

export async function wikipediaSearch(query: string, limit = 8, language = 'es'): Promise<WebSearchResult[]> {
  const text = query.trim()
  if (!text) throw new Error('Indica qué deseas buscar en Wikipedia.')
  const lang = /^[a-z]{2,3}$/i.test(language) ? language.toLowerCase() : 'es'
  const endpoint = new URL(`https://${lang}.wikipedia.org/w/api.php`)
  endpoint.searchParams.set('action', 'query')
  endpoint.searchParams.set('generator', 'search')
  endpoint.searchParams.set('gsrsearch', text)
  endpoint.searchParams.set('gsrlimit', String(Math.max(1, Math.min(10, limit))))
  endpoint.searchParams.set('prop', 'extracts|info|pageimages')
  endpoint.searchParams.set('inprop', 'url')
  endpoint.searchParams.set('exintro', '1')
  endpoint.searchParams.set('explaintext', '1')
  endpoint.searchParams.set('exsentences', '3')
  endpoint.searchParams.set('pithumbsize', '640')
  endpoint.searchParams.set('format', 'json')
  endpoint.searchParams.set('formatversion', '2')

  const response = await fetch(endpoint, {
    headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/1.1 (Wikipedia search)' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Wikipedia respondió HTTP ${response.status}.`)
  const payload = await response.json() as { query?: { pages?: WikipediaPage[] } }
  const pages = (payload.query?.pages ?? []).filter((page) => page.ns === 0 && page.title)
  pages.sort((a, b) => Number(a.index ?? 999) - Number(b.index ?? 999))
  return pages.slice(0, Math.max(1, Math.min(10, limit))).map((page) => ({
    title: page.title!,
    url: page.fullurl ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title!.replace(/ /g, '_'))}`,
    snippet: cleanText(page.extract ?? '').slice(0, 700) || 'Sin resumen disponible.',
    thumbnail: page.thumbnail?.source,
  }))
}
