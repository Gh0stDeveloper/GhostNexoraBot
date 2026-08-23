import { load } from 'cheerio'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export type WebSearchResult = { title: string; url: string; snippet?: string; thumbnail?: string }
const cleanText = (value: string) => value.replace(/\s+/g, ' ').trim()

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
  } catch { return null }
}

async function googleHtml(query: string, limit: number) {
  const endpoint = new URL('https://www.google.com/search')
  endpoint.searchParams.set('q', query); endpoint.searchParams.set('hl', 'es'); endpoint.searchParams.set('gl', 'mx'); endpoint.searchParams.set('num', '10'); endpoint.searchParams.set('filter', '0')
  const response = await fetch(endpoint, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml', 'accept-language': 'es-MX,es;q=0.9,en;q=0.7' }, signal: AbortSignal.timeout(18_000) })
  if (!response.ok) throw new Error(`Google respondió HTTP ${response.status}.`)
  const html = await response.text()
  if (/unusual traffic|recaptcha|detected unusual traffic/i.test(html)) throw new Error('google_challenge')
  const $ = load(html); const found = new Map<string, WebSearchResult>()
  $('a').each((_, element) => {
    if (found.size >= limit) return
    const anchor = $(element); const heading = anchor.find('h3').first(); if (!heading.length) return
    const url = googleTarget(anchor.attr('href') ?? ''); if (!url || found.has(url)) return
    const title = cleanText(heading.text()); if (!title) return
    const box = anchor.closest('.MjjYud').length ? anchor.closest('.MjjYud') : anchor.parent().parent()
    const snippet = cleanText(box.find('.VwiC3b, .aCOpRe, .IsZvec').first().text()) || undefined
    found.set(url, { title: title.slice(0, 180), url, snippet: snippet?.slice(0, 500) })
  })
  if (!found.size) throw new Error('google_empty')
  return [...found.values()]
}

function decodeDuckUrl(href: string) {
  try {
    const u = new URL(href, 'https://html.duckduckgo.com')
    const uddg = u.searchParams.get('uddg')
    return uddg ? decodeURIComponent(uddg) : (/^https?:/i.test(href) ? href : null)
  } catch { return null }
}

async function duckDuckGoFallback(query: string, limit: number) {
  const body = new URLSearchParams({ q: query, kl: 'mx-es' })
  const response = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST', body,
    headers: { 'user-agent': USER_AGENT, 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' },
    signal: AbortSignal.timeout(18_000),
  })
  if (!response.ok) throw new Error(`El buscador de respaldo respondió HTTP ${response.status}.`)
  const $ = load(await response.text()); const rows: WebSearchResult[] = []
  $('.result').each((_, element) => {
    if (rows.length >= limit) return
    const node = $(element); const link = node.find('.result__a').first(); const url = decodeDuckUrl(link.attr('href') ?? '')
    const title = cleanText(link.text()); if (!url || !title) return
    const snippet = cleanText(node.find('.result__snippet').text()) || undefined
    rows.push({ title: title.slice(0, 180), url, snippet: snippet?.slice(0, 500) })
  })
  return rows
}

export async function googleSearch(query: string, limit = 8): Promise<WebSearchResult[]> {
  const text = query.trim(); if (!text) throw new Error('Indica qué deseas buscar.')
  const count = Math.max(1, Math.min(10, limit))
  try { return await googleHtml(text, count) }
  catch {
    const fallback = await duckDuckGoFallback(text, count)
    if (fallback.length) return fallback
    throw new Error('No pude obtener resultados web en este momento.')
  }
}

type WikipediaPage = { pageid?: number; ns?: number; title?: string; extract?: string; fullurl?: string; index?: number; thumbnail?: { source?: string } }

async function wikiGenerator(text: string, limit: number, lang: string) {
  const endpoint = new URL(`https://${lang}.wikipedia.org/w/api.php`)
  endpoint.searchParams.set('origin', '*'); endpoint.searchParams.set('action', 'query'); endpoint.searchParams.set('generator', 'search'); endpoint.searchParams.set('gsrsearch', text); endpoint.searchParams.set('gsrlimit', String(limit))
  endpoint.searchParams.set('prop', 'extracts|info|pageimages'); endpoint.searchParams.set('inprop', 'url'); endpoint.searchParams.set('exintro', '1'); endpoint.searchParams.set('explaintext', '1'); endpoint.searchParams.set('pithumbsize', '640'); endpoint.searchParams.set('format', 'json'); endpoint.searchParams.set('formatversion', '2')
  const response = await fetch(endpoint, { headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/2.0 Wikipedia' }, signal: AbortSignal.timeout(18_000) })
  if (!response.ok) throw new Error(`Wikipedia respondió HTTP ${response.status}.`)
  const payload = await response.json() as { query?: { pages?: WikipediaPage[] } }
  const pages = (payload.query?.pages ?? []).filter((page) => page.ns === 0 && page.title)
  pages.sort((a, b) => Number(a.index ?? 999) - Number(b.index ?? 999))
  return pages.map((page) => ({ title: page.title!, url: page.fullurl ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title!.replace(/ /g, '_'))}`, snippet: cleanText(page.extract ?? '').slice(0, 900) || 'Sin resumen disponible.', thumbnail: page.thumbnail?.source }))
}

async function wikiOpenSearch(text: string, limit: number, lang: string) {
  const endpoint = new URL(`https://${lang}.wikipedia.org/w/api.php`)
  endpoint.searchParams.set('origin', '*'); endpoint.searchParams.set('action', 'opensearch'); endpoint.searchParams.set('search', text); endpoint.searchParams.set('limit', String(limit)); endpoint.searchParams.set('namespace', '0'); endpoint.searchParams.set('format', 'json')
  const response = await fetch(endpoint, { headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/2.0 Wikipedia' }, signal: AbortSignal.timeout(18_000) })
  if (!response.ok) return []
  const data = await response.json() as [string, string[], string[], string[]]
  return (data[1] ?? []).map((title, index) => ({ title, snippet: cleanText(data[2]?.[index] ?? '') || 'Sin resumen disponible.', url: data[3]?.[index] ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` }))
}

export async function wikipediaSearch(query: string, limit = 8, language = 'es'): Promise<WebSearchResult[]> {
  const text = query.trim(); if (!text) throw new Error('Indica qué deseas buscar en Wikipedia.')
  const lang = /^[a-z]{2,3}$/i.test(language) ? language.toLowerCase() : 'es'; const count = Math.max(1, Math.min(10, limit))
  try { const rows = await wikiGenerator(text, count, lang); if (rows.length) return rows }
  catch { /* fallback below */ }
  const rows = await wikiOpenSearch(text, count, lang)
  if (!rows.length) throw new Error('Wikipedia no encontró resultados para esa búsqueda.')
  return rows
}
