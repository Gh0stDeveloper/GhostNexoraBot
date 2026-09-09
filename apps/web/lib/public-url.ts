import { runtime } from './runtime'

function firstHeader(value: string | null) {
  return value?.split(',')[0]?.trim() ?? ''
}

function loopbackHost(hostname: string) {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return value === 'localhost' || value === '127.0.0.1' || value === '::1' || value === '0.0.0.0'
}

function configuredPublicBase() {
  try {
    const url = new URL(runtime.publicWebUrl)
    return loopbackHost(url.hostname) ? null : url
  } catch {
    return null
  }
}

function requestBase(request: Request) {
  const configured = configuredPublicBase()
  if (configured) return configured

  const forwardedHost = firstHeader(request.headers.get('x-forwarded-host'))
  const host = forwardedHost || firstHeader(request.headers.get('host'))
  const forwardedProto = firstHeader(request.headers.get('x-forwarded-proto')).toLowerCase()
  const source = new URL(request.url)
  const protocol = forwardedProto === 'https' || forwardedProto === 'http'
    ? `${forwardedProto}:`
    : source.protocol

  if (host) {
    const candidate = new URL(`${protocol}//${host}`)
    if (!loopbackHost(candidate.hostname)) return candidate
  }

  return source
}

/**
 * Builds redirects using the public reverse-proxy origin instead of Next.js'
 * internal localhost origin. PUBLIC_WEB_URL wins when it is a real public URL;
 * otherwise X-Forwarded-Host/Proto are used before falling back to request.url.
 */
export function publicUrl(request: Request, pathname: string) {
  return new URL(pathname, requestBase(request))
}

export function publicOrigin(request: Request) {
  const base = requestBase(request)
  return `${base.protocol}//${base.host}`
}
