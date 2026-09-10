import { createWriteStream } from 'node:fs'
import { mkdtemp, open, rm } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import { config } from '../../config.js'

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
const HTML_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const MAX_HTML_REDIRECTS = 8

type StoredCookie = {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  hostOnly: boolean
  expiresAt?: number
}

function setCookieValues(headers: Headers) {
  const extended = headers as Headers & { getSetCookie?: () => string[] }
  if (typeof extended.getSetCookie === 'function') return extended.getSetCookie()
  const raw = headers.get('set-cookie')
  if (!raw) return []
  return raw.split(/,(?=\s*[^;,=\s]+=[^;,]*)/g).map((value) => value.trim()).filter(Boolean)
}

function cookieDefaultPath(pathname: string) {
  if (!pathname.startsWith('/') || pathname === '/') return '/'
  const index = pathname.lastIndexOf('/')
  return index <= 0 ? '/' : pathname.slice(0, index + 1)
}

function sameSiteHint(target: URL, referer?: string) {
  if (!referer) return 'none'
  try {
    return new URL(referer).origin === target.origin ? 'same-origin' : 'cross-site'
  } catch {
    return 'none'
  }
}

export function assertProviderUrl(value: string, allowedHosts: readonly RegExp[]) {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('El proveedor devolvió una URL inválida.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('El proveedor devolvió un protocolo no permitido.')
  const host = url.hostname.toLowerCase()
  if (!allowedHosts.some((pattern) => pattern.test(host))) throw new Error(`Host de proveedor no permitido: ${host}`)
  return url.toString()
}

/**
 * Sesión HTTP acotada para proveedores que firman enlaces en varias etapas.
 * Conserva únicamente cookies recibidas por HTTP(S) y solo las vuelve a enviar
 * cuando dominio/path/secure coinciden. No persiste datos entre comandos.
 */
export class ProviderHttpSession {
  private readonly cookies = new Map<string, StoredCookie>()

  private captureCookies(headers: Headers, requestUrl: string) {
    const url = new URL(requestUrl)
    for (const raw of setCookieValues(headers)) {
      const parts = raw.split(';').map((part) => part.trim()).filter(Boolean)
      const pair = parts.shift()
      if (!pair) continue
      const equals = pair.indexOf('=')
      if (equals <= 0) continue
      const name = pair.slice(0, equals).trim()
      const value = pair.slice(equals + 1).trim()
      if (!name) continue

      let domain = url.hostname.toLowerCase()
      let hostOnly = true
      let cookiePath = cookieDefaultPath(url.pathname)
      let secure = false
      let expiresAt: number | undefined

      for (const attribute of parts) {
        const separator = attribute.indexOf('=')
        const key = (separator < 0 ? attribute : attribute.slice(0, separator)).trim().toLowerCase()
        const attributeValue = separator < 0 ? '' : attribute.slice(separator + 1).trim()
        if (key === 'domain' && attributeValue) {
          const requestedDomain = attributeValue.replace(/^\./, '').toLowerCase()
          const host = url.hostname.toLowerCase()
          if (!(host === requestedDomain || host.endsWith(`.${requestedDomain}`))) continue
          domain = requestedDomain
          hostOnly = false
        } else if (key === 'path' && attributeValue.startsWith('/')) {
          cookiePath = attributeValue
        } else if (key === 'secure') {
          secure = true
        } else if (key === 'max-age' && /^-?\d+$/.test(attributeValue)) {
          expiresAt = Date.now() + Number(attributeValue) * 1000
        } else if (key === 'expires' && attributeValue && expiresAt === undefined) {
          const parsed = Date.parse(attributeValue)
          if (Number.isFinite(parsed)) expiresAt = parsed
        }
      }

      const cookie: StoredCookie = { name, value, domain, path: cookiePath, secure, hostOnly, expiresAt }
      const cacheKey = `${domain}|${cookiePath}|${name}`
      if (!value || (expiresAt !== undefined && expiresAt <= Date.now())) this.cookies.delete(cacheKey)
      else this.cookies.set(cacheKey, cookie)
    }
  }

  cookieHeader(input: string) {
    const target = new URL(input)
    const now = Date.now()
    const values: string[] = []
    for (const [key, cookie] of this.cookies) {
      if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) {
        this.cookies.delete(key)
        continue
      }
      const host = target.hostname.toLowerCase()
      const domainMatches = cookie.hostOnly ? host === cookie.domain : (host === cookie.domain || host.endsWith(`.${cookie.domain}`))
      if (!domainMatches || !target.pathname.startsWith(cookie.path)) continue
      if (cookie.secure && target.protocol !== 'https:') continue
      values.push(`${cookie.name}=${cookie.value}`)
    }
    return values.join('; ')
  }

  headersFor(input: string, options: { referer?: string; accept?: string; navigation?: boolean } = {}) {
    const target = new URL(input)
    const cookies = this.cookieHeader(target.toString())
    const navigation = options.navigation === true
    return {
      'user-agent': UA,
      accept: options.accept ?? (navigation ? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' : '*/*'),
      'accept-language': 'es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7',
      ...(navigation ? {
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': sameSiteHint(target, options.referer),
        'upgrade-insecure-requests': '1',
      } : {}),
      ...(options.referer ? { referer: options.referer } : {}),
      ...(cookies ? { cookie: cookies } : {}),
    } as Record<string, string>
  }

  async fetchHtml(
    input: string,
    allowedHosts: readonly RegExp[],
    options: { referer?: string; timeoutMs?: number } = {},
  ) {
    let currentUrl = assertProviderUrl(input, allowedHosts)
    let referer = options.referer

    for (let redirectCount = 0; redirectCount <= MAX_HTML_REDIRECTS; redirectCount += 1) {
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        headers: this.headersFor(currentUrl, { referer, navigation: true }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 25_000),
      })
      this.captureCookies(response.headers, currentUrl)

      if (HTML_REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location')
        if (!location) throw new Error(`El proveedor respondió HTTP ${response.status} sin Location.`)
        if (redirectCount >= MAX_HTML_REDIRECTS) throw new Error(`El proveedor superó ${MAX_HTML_REDIRECTS} redirecciones HTML.`)
        const nextUrl = assertProviderUrl(new URL(location, currentUrl).toString(), allowedHosts)
        try { await response.body?.cancel() } catch {}
        referer = currentUrl
        currentUrl = nextUrl
        continue
      }

      const finalUrl = assertProviderUrl(response.url || currentUrl, allowedHosts)
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        const challenge = /cloudflare|attention required|just a moment|captcha|access denied/i.test(body)
        throw new Error(`HTTP ${response.status} al consultar ${new URL(finalUrl).hostname}${challenge ? ' (protección anti-bot activa)' : ''}.`)
      }
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType && !/html|text\//i.test(contentType)) throw new Error(`El proveedor devolvió ${contentType} cuando se esperaba HTML.`)
      return { html: await response.text(), finalUrl }
    }

    throw new Error('El proveedor superó el límite de redirecciones HTML.')
  }
}

export async function fetchProviderHtml(
  input: string,
  allowedHosts: readonly RegExp[],
  options: { referer?: string; timeoutMs?: number } = {},
) {
  return new ProviderHttpSession().fetchHtml(input, allowedHosts, options)
}

function safeFileBase(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 90) || 'download'
}

export type ProviderDownloadedFile = {
  filePath: string
  fileName: string
  size: number
  contentType: string
  finalUrl: string
  cleanup: () => Promise<void>
}

export async function downloadProviderFile(
  input: string,
  options: {
    allowedHosts: readonly RegExp[]
    provider: string
    fileBase: string
    extension: string
    referer?: string
    requireZipMagic?: boolean
    headers?: Record<string, string>
  },
): Promise<ProviderDownloadedFile> {
  const url = assertProviderUrl(input, options.allowedHosts)
  const dir = await mkdtemp(path.join(os.tmpdir(), `ghostnexora-${safeFileBase(options.provider).toLowerCase()}-`))
  const fileName = `${safeFileBase(options.fileBase)}.${options.extension.replace(/^\./, '').toLowerCase()}`
  const filePath = path.join(dir, fileName)

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        accept: '*/*',
        ...(options.referer ? { referer: options.referer } : {}),
        ...(options.headers ?? {}),
      },
      signal: AbortSignal.timeout(20 * 60_000),
    })
    if (!response.ok || !response.body) throw new Error(`${options.provider} respondió HTTP ${response.status}.`)

    const finalUrl = response.url || url
    assertProviderUrl(finalUrl, options.allowedHosts)
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
    if (/text\/html|application\/json/i.test(contentType)) throw new Error(`${options.provider} devolvió ${contentType} en lugar de un archivo.`)

    const declared = Number(response.headers.get('content-length') ?? 0)
    if (Number.isFinite(declared) && declared > config.maxDownloadBytes) {
      throw new Error(`El archivo supera el límite configurado de ${config.maxDownloadMb} MB.`)
    }

    let size = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length
        if (size > config.maxDownloadBytes) callback(new Error(`El archivo supera el límite configurado de ${config.maxDownloadMb} MB.`))
        else callback(null, chunk)
      },
    })
    await pipeline(response.body as any, limiter, createWriteStream(filePath, { mode: 0o600 }))
    if (size < 32) throw new Error(`${options.provider} devolvió un archivo vacío o incompleto.`)

    if (options.requireZipMagic) {
      const handle = await open(filePath, 'r')
      try {
        const header = Buffer.alloc(4)
        const { bytesRead } = await handle.read(header, 0, 4, 0)
        if (bytesRead < 4 || header[0] !== 0x50 || header[1] !== 0x4b) {
          throw new Error(`${options.provider} no devolvió un APK/XAPK/APKS válido (ZIP magic ausente).`)
        }
      } finally {
        await handle.close()
      }
    }

    return {
      filePath,
      fileName,
      size,
      contentType,
      finalUrl,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}
