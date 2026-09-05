import http from 'node:http'
import dns from 'node:dns/promises'
import net from 'node:net'
import { TextDecoder } from 'node:util'
import { URL } from 'node:url'
import { load } from 'cheerio'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
const MAX_RESOURCE_BYTES = 16 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 20_000
const MAX_REDIRECTS = 6
const SESSION_TTL_MS = 30 * 60_000
const MAX_SESSIONS = 500
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 16; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'

type HttpMethod = 'GET' | 'POST'
type CookieSession = {
  expiresAt: number
  hosts: Map<string, Map<string, string>>
}

type FetchOptions = {
  sid?: string
  method?: HttpMethod
  body?: string
  contentType?: string
  accept?: string
  maxBytes?: number
}

type RemoteResult = {
  status: number
  contentType: string
  buffer: Buffer
  finalUrl: string
}

export type BrowserDocument = {
  status: number
  bytes: number
  html: string
  finalUrl: string
  subrecursos: number
  title: string
}

const sessions = new Map<string, CookieSession>()

function json(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  })
  res.end(JSON.stringify(payload))
}

function htmlResponse(res: http.ServerResponse, status: number, html: string) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
  })
  res.end(html)
}

function binaryResponse(res: http.ServerResponse, status: number, contentType: string, buffer: Buffer) {
  res.writeHead(status, {
    'content-type': contentType || 'application/octet-stream',
    'content-length': String(buffer.length),
    'cache-control': 'private, max-age=300',
    'access-control-allow-origin': '*',
    'cross-origin-resource-policy': 'cross-origin',
    'x-content-type-options': 'nosniff',
  })
  res.end(buffer)
}

function isPrivateAddress(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number)
    return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0 || a >= 224
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase()
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:') || normalized.startsWith('ff')
  }
  return true
}

async function assertPublicTarget(rawUrl: string) {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se permiten URLs HTTP/HTTPS.')
  if (url.username || url.password) throw new Error('Las URLs con credenciales no están permitidas.')

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('La URL apunta a una dirección privada o reservada.')
  } else {
    const results = await dns.lookup(host, { all: true, verbatim: true })
    if (!results.length || results.some((item) => isPrivateAddress(item.address))) {
      throw new Error('El dominio resuelve a una dirección privada o reservada.')
    }
  }
  return url
}

function normalizeSid(value?: string) {
  const sid = (value ?? '').trim()
  return /^[A-Za-z0-9_-]{8,80}$/.test(sid) ? sid : ''
}

function getSession(sid: string) {
  if (!sid) return null
  const now = Date.now()
  let session = sessions.get(sid)
  if (!session || session.expiresAt <= now) {
    session = { expiresAt: now + SESSION_TTL_MS, hosts: new Map() }
    sessions.set(sid, session)
  } else {
    session.expiresAt = now + SESSION_TTL_MS
  }

  if (sessions.size > MAX_SESSIONS) {
    for (const [key, value] of sessions) {
      if (value.expiresAt <= now || sessions.size > MAX_SESSIONS) sessions.delete(key)
      if (sessions.size <= MAX_SESSIONS) break
    }
  }
  return session
}

function cookieHeader(sid: string, hostname: string) {
  const hostCookies = getSession(sid)?.hosts.get(hostname)
  if (!hostCookies?.size) return ''
  return [...hostCookies].map(([name, value]) => `${name}=${value}`).join('; ')
}

function absorbCookies(sid: string, hostname: string, headers: Headers) {
  const session = getSession(sid)
  if (!session) return
  let hostCookies = session.hosts.get(hostname)
  if (!hostCookies) {
    hostCookies = new Map()
    session.hosts.set(hostname, hostCookies)
  }

  const typed = headers as Headers & { getSetCookie?: () => string[] }
  const lines = typeof typed.getSetCookie === 'function'
    ? typed.getSetCookie()
    : [headers.get('set-cookie')].filter((value): value is string => Boolean(value))

  for (const line of lines) {
    const match = /^\s*([^=;,\s]+)=([^;]*)/.exec(line)
    if (!match) continue
    const [, name, value] = match
    if (!value || /(?:^|;)\s*max-age=0(?:;|$)/i.test(line)) hostCookies.delete(name)
    else hostCookies.set(name, value)
  }
}

async function readLimited(response: Response, maxBytes: number) {
  const lengthHeader = response.headers.get('content-length')
  if (lengthHeader && Number(lengthHeader) > maxBytes) {
    throw new Error(`El recurso supera el límite de ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`)
  }

  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new Error(`El recurso supera el límite de ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`)
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

async function fetchRemote(startUrl: string, options: FetchOptions = {}): Promise<RemoteResult> {
  const sid = normalizeSid(options.sid)
  let current = await assertPublicTarget(startUrl)
  let method: HttpMethod = options.method ?? 'GET'
  let body = method === 'POST' ? options.body ?? '' : undefined
  const maxBytes = options.maxBytes ?? MAX_DOCUMENT_BYTES

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const headers: Record<string, string> = {
        'user-agent': MOBILE_UA,
        accept: options.accept ?? 'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5',
        'accept-language': 'es-MX,es;q=0.9,en;q=0.7',
      }
      const cookies = cookieHeader(sid, current.hostname)
      if (cookies) headers.cookie = cookies
      if (body !== undefined) headers['content-type'] = options.contentType || 'application/x-www-form-urlencoded;charset=UTF-8'

      const response = await fetch(current, {
        method,
        body,
        redirect: 'manual',
        signal: controller.signal,
        headers,
      })
      absorbCookies(sid, current.hostname, response.headers)

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw new Error(`Redirección ${response.status} sin destino.`)
        const next = await assertPublicTarget(new URL(location, current).toString())
        if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
          method = 'GET'
          body = undefined
        }
        current = next
        continue
      }

      const buffer = await readLimited(response, maxBytes)
      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
        buffer,
        finalUrl: current.toString(),
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error('Se alcanzó el límite de redirecciones.')
}

function decodeText(buffer: Buffer, contentType: string) {
  const charset = /charset\s*=\s*["']?([^;"'\s]+)/i.exec(contentType)?.[1] || 'utf-8'
  try {
    return new TextDecoder(charset).decode(buffer)
  } catch {
    return buffer.toString('utf8')
  }
}

function absoluteHttpUrl(value: string, baseUrl: string) {
  const raw = value.trim()
  if (!raw || raw.startsWith('#') || /^(?:data|blob|javascript|mailto|tel):/i.test(raw)) return null
  try {
    const url = new URL(raw, baseUrl)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

function proxyResourceUrl(targetUrl: string, sid: string) {
  const params = new URLSearchParams({ mode: 'resource', url: targetUrl })
  if (sid) params.set('sid', sid)
  return `${config.browserProxyPublicUrl}?${params.toString()}`
}

function rewriteCss(css: string, baseUrl: string, sid: string) {
  let out = css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (full, quote: string, raw: string) => {
    const absolute = absoluteHttpUrl(raw, baseUrl)
    if (!absolute) return full
    const proxied = proxyResourceUrl(absolute, sid)
    return `url(${quote || '"'}${proxied}${quote || '"'})`
  })

  out = out.replace(/@import\s+(["'])([^"']+)\1/gi, (full, quote: string, raw: string) => {
    const absolute = absoluteHttpUrl(raw, baseUrl)
    if (!absolute) return full
    return `@import ${quote}${proxyResourceUrl(absolute, sid)}${quote}`
  })
  return out
}

function rewriteSrcset(value: string, baseUrl: string, sid: string) {
  if (!value || /data:/i.test(value)) return value
  return value.split(',').map((item) => {
    const parts = item.trim().split(/\s+/)
    const absolute = absoluteHttpUrl(parts[0] ?? '', baseUrl)
    if (!absolute) return item.trim()
    parts[0] = proxyResourceUrl(absolute, sid)
    return parts.join(' ')
  }).join(', ')
}

function escapeAttr(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function rewriteDocument(raw: string, finalUrl: string, sid: string) {
  const $ = load(raw)
  const title = $('title').first().text().replace(/\s+/g, ' ').trim().slice(0, 180)
  const subresources = $('script[src],link[href],img[src],iframe[src],video[src],audio[src],source[src],form[action]').length

  $('base,script,meta[http-equiv="content-security-policy"],meta[http-equiv="refresh"],object,embed').remove()

  $('*').each((_, node) => {
    const attrs = (node as { attribs?: Record<string, string> }).attribs
    if (!attrs) return
    for (const name of Object.keys(attrs)) {
      const lower = name.toLowerCase()
      if (lower.startsWith('on') || lower === 'integrity' || lower === 'nonce') $(node).removeAttr(name)
    }
  })

  $('img').each((_, node) => {
    const el = $(node)
    if (!el.attr('src')) {
      const lazy = el.attr('data-src') || el.attr('data-original') || el.attr('data-lazy-src')
      if (lazy) el.attr('src', lazy)
    }
    if (!el.attr('srcset') && el.attr('data-srcset')) el.attr('srcset', el.attr('data-srcset'))
    el.removeAttr('loading')
  })

  $('a[href]').each((_, node) => {
    const el = $(node)
    const href = el.attr('href')?.trim() ?? ''
    if (!href) return
    if (href.startsWith('#')) {
      el.attr('data-gn-fragment', href.slice(1))
      return
    }
    const absolute = absoluteHttpUrl(href, finalUrl)
    if (absolute) {
      el.attr('href', '#')
      el.attr('data-gn-url', absolute)
      el.removeAttr('target')
      el.removeAttr('rel')
    } else if (/^javascript:/i.test(href)) {
      el.removeAttr('href')
    }
  })

  $('form').each((_, node) => {
    const el = $(node)
    const action = absoluteHttpUrl(el.attr('action') || finalUrl, finalUrl) || finalUrl
    const method = (el.attr('method') || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET'
    el.attr('action', '#')
    el.attr('data-gn-action', action)
    el.attr('data-gn-method', method)
    el.removeAttr('target')
  })

  $('button[formaction],input[formaction]').each((_, node) => {
    const el = $(node)
    const absolute = absoluteHttpUrl(el.attr('formaction') || '', finalUrl)
    if (!absolute) return
    el.attr('data-gn-formaction', absolute)
    el.removeAttr('formaction')
  })

  const rewriteResourceAttr = (selector: string, attr: string) => {
    $(selector).each((_, node) => {
      const el = $(node)
      const absolute = absoluteHttpUrl(el.attr(attr) || '', finalUrl)
      if (absolute) el.attr(attr, proxyResourceUrl(absolute, sid))
    })
  }

  rewriteResourceAttr('img[src],input[type="image"][src],source[src],video[src],audio[src],track[src]', 'src')
  rewriteResourceAttr('video[poster]', 'poster')

  $('img[srcset],source[srcset]').each((_, node) => {
    const el = $(node)
    const value = el.attr('srcset')
    if (value) el.attr('srcset', rewriteSrcset(value, finalUrl, sid))
  })

  $('link[href]').each((_, node) => {
    const el = $(node)
    const rel = (el.attr('rel') || '').toLowerCase()
    if (!/(?:stylesheet|icon|preload)/.test(rel)) {
      el.remove()
      return
    }
    const absolute = absoluteHttpUrl(el.attr('href') || '', finalUrl)
    if (absolute) el.attr('href', proxyResourceUrl(absolute, sid))
    el.removeAttr('integrity')
    el.removeAttr('crossorigin')
  })

  $('style').each((_, node) => {
    const el = $(node)
    el.text(rewriteCss(el.text(), finalUrl, sid))
  })

  $('[style]').each((_, node) => {
    const el = $(node)
    const value = el.attr('style')
    if (value) el.attr('style', rewriteCss(value, finalUrl, sid))
  })

  $('iframe[src]').each((_, node) => {
    const el = $(node)
    const src = absoluteHttpUrl(el.attr('src') || '', finalUrl)
    if (!src) {
      el.remove()
      return
    }
    el.replaceWith(`<a href="#" data-gn-url="${escapeAttr(src)}" style="display:block;padding:12px;border:1px solid #bbb;border-radius:8px;text-decoration:none">Abrir contenido incrustado</a>`)
  })

  const headAssets = $('head').find('style,link[rel~="stylesheet"]').map((_, node) => $.html(node)).get().join('\n')
  const body = $('body')
  const bodyClass = escapeAttr(body.attr('class') || '')
  const bodyStyle = escapeAttr(rewriteCss(body.attr('style') || '', finalUrl, sid))
  const bodyHtml = body.html() ?? $.root().html()

  const html = [
    '<style>',
    ':host{display:block;color:#111;background:#fff;font-family:Arial,Helvetica,sans-serif}',
    '.gn-document{min-height:100%;background:#fff;color:#111;overflow-wrap:anywhere}',
    '.gn-document img,.gn-document video{max-width:100%;height:auto}',
    '.gn-document table{max-width:100%}',
    '.gn-document a{cursor:pointer}',
    '</style>',
    headAssets,
    `<div class="gn-document ${bodyClass}" style="${bodyStyle}">${bodyHtml}</div>`,
  ].join('\n')

  return { html, title, subresources }
}

async function fetchDocument(startUrl: string, options: FetchOptions = {}): Promise<BrowserDocument> {
  const sid = normalizeSid(options.sid)
  const remote = await fetchRemote(startUrl, {
    ...options,
    sid,
    accept: 'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5',
    maxBytes: MAX_DOCUMENT_BYTES,
  })
  const raw = decodeText(remote.buffer, remote.contentType)
  const isHtml = /text\/html|application\/xhtml\+xml/i.test(remote.contentType) || /<html[\s>]|<!doctype html/i.test(raw)

  if (!isHtml) {
    const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const html = `<style>:host{display:block;background:#fff;color:#111}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:16px}</style><pre>${escaped}</pre>`
    return {
      status: remote.status,
      bytes: Buffer.byteLength(html),
      html,
      finalUrl: remote.finalUrl,
      subrecursos: 0,
      title: new URL(remote.finalUrl).hostname,
    }
  }

  const rewritten = rewriteDocument(raw, remote.finalUrl, sid)
  return {
    status: remote.status,
    bytes: Buffer.byteLength(rewritten.html),
    html: rewritten.html,
    finalUrl: remote.finalUrl,
    subrecursos: rewritten.subresources,
    title: rewritten.title || new URL(remote.finalUrl).hostname,
  }
}

export async function fetchBrowserDocument(startUrl: string, options: FetchOptions = {}) {
  return fetchDocument(startUrl, options)
}

async function fetchResource(startUrl: string, sid: string) {
  const remote = await fetchRemote(startUrl, {
    sid,
    accept: '*/*',
    maxBytes: MAX_RESOURCE_BYTES,
  })
  if (/text\/css/i.test(remote.contentType)) {
    const css = rewriteCss(decodeText(remote.buffer, remote.contentType), remote.finalUrl, sid)
    return { ...remote, buffer: Buffer.from(css, 'utf8'), contentType: 'text/css; charset=utf-8' }
  }
  return remote
}

async function readJsonBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > 1024 * 1024) throw new Error('Payload demasiado grande.')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>
}

let server: http.Server | null = null

export function startBrowserProxy() {
  if (server) return server

  server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      })
      res.end()
      return
    }

    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
    if (requestUrl.pathname === '/health') {
      json(res, 200, { ok: true, service: 'ghost-nexora-browser-proxy', port: config.browserProxyPort, mode: 'interactive-dom' })
      return
    }

    if (requestUrl.pathname !== '/proxy') {
      json(res, 404, { ok: false, error: 'not_found' })
      return
    }

    try {
      const mode = requestUrl.searchParams.get('mode') || (requestUrl.searchParams.get('format') === 'html' ? 'html' : 'json')
      const sid = normalizeSid(requestUrl.searchParams.get('sid') || '')

      if (mode === 'resource') {
        const target = requestUrl.searchParams.get('url')?.trim()
        if (!target) {
          json(res, 400, { ok: false, error: 'missing_url' })
          return
        }
        const resource = await fetchResource(target, sid)
        binaryResponse(res, resource.status, resource.contentType, resource.buffer)
        return
      }

      let target = requestUrl.searchParams.get('url')?.trim() || ''
      let method: HttpMethod = 'GET'
      let body: string | undefined
      let contentType: string | undefined

      if (req.method === 'POST') {
        const input = await readJsonBody(req)
        target = String(input.url || target).trim()
        method = String(input.method || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET'
        body = method === 'POST' ? String(input.body || '') : undefined
        contentType = method === 'POST' ? String(input.contentType || 'application/x-www-form-urlencoded;charset=UTF-8') : undefined
      }

      if (!target) {
        json(res, 400, { ok: false, error: 'missing_url', message: 'Usa /proxy?mode=document&url=https://example.com' })
        return
      }

      const result = await fetchDocument(target, { sid, method, body, contentType })
      if (mode === 'html') {
        htmlResponse(res, result.status, `<!doctype html><html><head><meta charset="utf-8"><title>${escapeAttr(result.title)}</title></head><body>${result.html}</body></html>`)
        return
      }
      if (mode === 'document') {
        json(res, 200, { ok: true, ...result })
        return
      }
      json(res, 200, { ok: true, ...result })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn({ error: message }, 'browser proxy request failed')
      json(res, 400, { ok: false, error: message })
    }
  })

  server.on('error', (error) => logger.error({ error, port: config.browserProxyPort }, 'browser proxy server error'))
  server.listen(config.browserProxyPort, '127.0.0.1', () => {
    logger.info({ port: config.browserProxyPort }, 'interactive browser proxy listening on loopback')
  })
  return server
}
