import http from 'node:http'
import dns from 'node:dns/promises'
import net from 'node:net'
import { URL } from 'node:url'
import { load } from 'cheerio'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 20_000
const MAX_REDIRECTS = 5

function json(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
  })
  res.end(JSON.stringify(payload))
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

async function fetchDocument(startUrl: string) {
  let current = await assertPublicTarget(startUrl)

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'GhostNexoraBotBrowser/1.0',
          accept: 'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5',
        },
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw new Error(`Redirección ${response.status} sin destino.`)
        current = await assertPublicTarget(new URL(location, current).toString())
        continue
      }

      const lengthHeader = response.headers.get('content-length')
      if (lengthHeader && Number(lengthHeader) > MAX_RESPONSE_BYTES) {
        throw new Error(`La página supera el límite de ${(MAX_RESPONSE_BYTES / 1024 / 1024).toFixed(0)} MB.`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('El servidor no devolvió un cuerpo válido.')
      const chunks: Buffer[] = []
      let total = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel()
          throw new Error(`La página supera el límite de ${(MAX_RESPONSE_BYTES / 1024 / 1024).toFixed(0)} MB.`)
        }
        chunks.push(Buffer.from(value))
      }

      const contentType = response.headers.get('content-type') ?? ''
      const raw = Buffer.concat(chunks).toString('utf8')
      const isHtml = /text\/html|application\/xhtml\+xml/i.test(contentType) || /<html[\s>]|<!doctype html/i.test(raw)
      let html = raw
      let subresources = 0

      if (isHtml) {
        const $ = load(raw)
        $('script[src],link[href],img[src],iframe[src],video[src],audio[src],source[src],form[action]').each(() => { subresources += 1 })
        if ($('base').length === 0) $('head').prepend(`<base href="${current.toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`)
        html = $.html()
      }

      return {
        status: response.status,
        bytes: Buffer.byteLength(html),
        html,
        finalUrl: current.toString(),
        subrecursos: subresources,
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error('Se alcanzó el límite de redirecciones.')
}

let server: http.Server | null = null

export function startBrowserProxy() {
  if (server) return server

  server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'content-type',
      })
      res.end()
      return
    }

    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
    if (requestUrl.pathname === '/health') {
      json(res, 200, { ok: true, service: 'ghost-nexora-browser-proxy', port: config.browserProxyPort })
      return
    }

    if (requestUrl.pathname !== '/proxy') {
      json(res, 404, { ok: false, error: 'not_found' })
      return
    }

    const target = requestUrl.searchParams.get('url')?.trim()
    if (!target) {
      json(res, 400, { ok: false, error: 'missing_url', message: 'Usa /proxy?url=https://example.com' })
      return
    }

    try {
      const result = await fetchDocument(target)
      json(res, 200, { ok: true, ...result })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn({ error: message, target }, 'browser proxy request failed')
      json(res, 400, { ok: false, error: message })
    }
  })

  server.on('error', (error) => logger.error({ error, port: config.browserProxyPort }, 'browser proxy server error'))
  server.listen(config.browserProxyPort, '127.0.0.1', () => {
    logger.info({ port: config.browserProxyPort }, 'browser proxy listening on loopback')
  })
  return server
}
