import { NextRequest, NextResponse } from 'next/server'
import dns from 'node:dns/promises'
import net from 'node:net'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 2_500_000
const TIMEOUT_MS = 18_000
const MAX_REDIRECTS = 5

function isPrivateAddress(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number)
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0 ||
      a >= 224
    )
  }
  if (net.isIPv6(address)) {
    const n = address.toLowerCase()
    return (
      n === '::1' ||
      n === '::' ||
      n.startsWith('fc') ||
      n.startsWith('fd') ||
      n.startsWith('fe80:') ||
      n.startsWith('ff')
    )
  }
  return true
}

async function assertPublicTarget(rawUrl: string) {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Solo se permiten URLs HTTP/HTTPS.')
  }
  if (url.username || url.password) {
    throw new Error('Las URLs con credenciales no están permitidas.')
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('Dirección privada o reservada.')
  } else {
    const results = await dns.lookup(host, { all: true, verbatim: true })
    if (!results.length || results.some((item) => isPrivateAddress(item.address))) {
      throw new Error('El dominio resuelve a una dirección privada o reservada.')
    }
  }
  return url
}

function normalizeUrl(raw: string) {
  let u = raw.trim()
  if (!u) return null
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  try {
    return new URL(u)
  } catch {
    return null
  }
}

function rewriteRelative(html: string, baseUrl: string) {
  try {
    const base = new URL(baseUrl)
    return html.replace(
      /\b(href|src|action)=["'](?!https?:|data:|mailto:|tel:|javascript:|#)([^"']+)["']/gi,
      (match, attr: string, path: string) => {
        try {
          return `${attr}="${new URL(path, base).href}"`
        } catch {
          return match
        }
      },
    )
  } catch {
    return html
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function fetchDocument(startUrl: string) {
  let current = await assertPublicTarget(startUrl)

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
        },
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw new Error(`Redirección ${response.status} sin destino.`)
        current = await assertPublicTarget(new URL(location, current).toString())
        continue
      }

      const buf = Buffer.from(await response.arrayBuffer())
      if (buf.length > MAX_BYTES) {
        throw new Error(`Respuesta demasiado grande (${buf.length} bytes)`)
      }

      let html = buf.toString('utf8')
      const ct = response.headers.get('content-type') || ''
      if (!/html|xml|text/i.test(ct) && !/^\s*</.test(html)) {
        html = `<pre style="white-space:pre-wrap;padding:12px;font-family:monospace">${escapeHtml(html.slice(0, 50_000))}</pre>`
      }

      // base tag helps relative assets in iframe
      if (!/<base\s/i.test(html)) {
        html = html.replace(
          /<head([^>]*)>/i,
          `<head$1><base href="${current.toString().replace(/"/g, '&quot;')}">`,
        )
      }
      html = rewriteRelative(html, current.toString())
      const subrecursos = (html.match(/<(img|script|link|iframe)\b/gi) || []).length

      return {
        status: response.status,
        bytes: buf.length,
        subrecursos,
        finalUrl: current.toString(),
        html,
      }
    } finally {
      clearTimeout(timer)
    }
  }

  throw new Error('Se alcanzó el límite de redirecciones.')
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

export async function GET(req: NextRequest) {
  const targetRaw = req.nextUrl.searchParams.get('url')?.trim() || ''
  const format = (req.nextUrl.searchParams.get('format') || 'json').toLowerCase()
  const target = normalizeUrl(targetRaw)

  if (!target) {
    if (format === 'html') {
      return new NextResponse(
        `<!doctype html><html><body style="font-family:system-ui;padding:24px;background:#0f1115;color:#fff"><h3>Ghost Nexora Browser</h3><p>URL inválida. Usa ?url=https://example.com&amp;format=html</p></body></html>`,
        { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'text/html; charset=utf-8' } },
      )
    }
    return NextResponse.json(
      { ok: false, error: 'URL inválida. Usa ?url=https://example.com' },
      { status: 400, headers: corsHeaders() },
    )
  }

  try {
    const result = await fetchDocument(target.toString())
    if (format === 'html') {
      return new NextResponse(result.html, {
        status: 200,
        headers: {
          ...corsHeaders(),
          'Content-Type': 'text/html; charset=utf-8',
          'X-Ghost-Nexora-Proxy': 'next-route',
          'X-Final-Url': result.finalUrl,
        },
      })
    }
    return NextResponse.json(
      { ok: true, ...result },
      {
        status: 200,
        headers: {
          ...corsHeaders(),
          'X-Ghost-Nexora-Proxy': 'next-route',
        },
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (format === 'html') {
      return new NextResponse(
        `<!doctype html><html><body style="font-family:system-ui;padding:24px;background:#0f1115;color:#fff"><h3>Ghost Nexora Browser</h3><p>${escapeHtml(message)}</p></body></html>`,
        { status: 502, headers: { ...corsHeaders(), 'Content-Type': 'text/html; charset=utf-8' } },
      )
    }
    return NextResponse.json({ ok: false, error: message }, { status: 502, headers: corsHeaders() })
  }
}
