#!/usr/bin/env node
/**
 * Proxy de navegador para .nav / .navegador / .view
 * Puerto: 3847 (NO usa 3000)
 * Público: https://ghostnexorabot.duckdns.org/proxy → 127.0.0.1:3847
 */
import http from 'node:http'
import { URL } from 'node:url'

const PORT = Number(process.env.BROWSER_PROXY_PORT || 3847)
const HOST = process.env.BROWSER_PROXY_HOST || '127.0.0.1'
const MAX_BYTES = Number(process.env.BROWSER_PROXY_MAX_BYTES || 2_500_000)
const TIMEOUT_MS = Number(process.env.BROWSER_PROXY_TIMEOUT_MS || 18_000)

const BLOCKED = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\./,
  /^\[::1\]/,
  /^metadata\.google/,
  /^169\.254\./,
]

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function json(res, status, body) {
  cors(res)
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(data),
  })
  res.end(data)
}

function isBlockedHost(hostname) {
  return BLOCKED.some((re) => re.test(hostname.toLowerCase()))
}

function normalizeUrl(raw) {
  let u = String(raw || '').trim()
  if (!u) return null
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  let parsed
  try { parsed = new URL(u) } catch { return null }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null
  if (isBlockedHost(parsed.hostname)) return null
  return parsed
}

function rewriteRelative(html, baseUrl) {
  try {
    const base = new URL(baseUrl)
    return html.replace(
      /\b(href|src|action)=["'](?!https?:|data:|mailto:|tel:|javascript:|#)([^"']+)["']/gi,
      (m, attr, path) => {
        try {
          return `${attr}="${new URL(path, base).href}"`
        } catch { return m }
      },
    )
  } catch { return html }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function fetchTarget(target) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(target.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
    })
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_BYTES) {
      return { ok: false, status: res.status, error: `Respuesta demasiado grande (${buf.length} bytes)` }
    }
    let html = buf.toString('utf8')
    const ct = res.headers.get('content-type') || ''
    if (!/html|xml|text/i.test(ct) && !/^\s*</.test(html)) {
      html = `<pre style="white-space:pre-wrap;padding:12px;font-family:monospace">${escapeHtml(html.slice(0, 50000))}</pre>`
    }
    html = rewriteRelative(html, res.url || target.href)
    const subrecursos = (html.match(/<(img|script|link|iframe)\b/gi) || []).length
    return { ok: true, status: res.status, bytes: buf.length, subrecursos, finalUrl: res.url || target.href, html }
  } finally {
    clearTimeout(timer)
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res)
    res.writeHead(204)
    res.end()
    return
  }
  const u = new URL(req.url || '/', `http://${HOST}:${PORT}`)
  if (u.pathname === '/health' || u.pathname === '/proxy/health') {
    json(res, 200, { ok: true, service: 'browser-proxy', port: PORT })
    return
  }
  if (u.pathname !== '/proxy' && u.pathname !== '/') {
    json(res, 404, { error: 'Not found. Use /proxy?url=https://...' })
    return
  }
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Solo GET' })
    return
  }
  const target = normalizeUrl(u.searchParams.get('url') || '')
  if (!target) {
    json(res, 400, { error: 'URL inválida o bloqueada. Usa ?url=https://...' })
    return
  }
  try {
    const result = await fetchTarget(target)
    if (!result.ok) {
      json(res, 502, { error: result.error, status: result.status })
      return
    }
    json(res, 200, {
      status: result.status,
      bytes: result.bytes,
      subrecursos: result.subrecursos,
      finalUrl: result.finalUrl,
      html: result.html,
    })
  } catch (e) {
    const msg = e?.name === 'AbortError' ? 'Timeout al cargar la URL' : String(e?.message || e)
    json(res, 500, { error: msg })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`✅ Browser proxy http://${HOST}:${PORT}/proxy`)
  console.log(`   → https://ghostnexorabot.duckdns.org/proxy`)
})
