import { createWriteStream } from 'node:fs'
import { mkdtemp, open, rm } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import { config } from '../../config.js'

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 GhostNexoraBot/2.0'

export function assertProviderUrl(value: string, allowedHosts: readonly RegExp[]) {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('El proveedor devolvió una URL inválida.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('El proveedor devolvió un protocolo no permitido.')
  const host = url.hostname.toLowerCase()
  if (!allowedHosts.some((pattern) => pattern.test(host))) throw new Error(`Host de proveedor no permitido: ${host}`)
  return url.toString()
}

export async function fetchProviderHtml(
  input: string,
  allowedHosts: readonly RegExp[],
  options: { referer?: string; timeoutMs?: number } = {},
) {
  const url = assertProviderUrl(input, allowedHosts)
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'accept-language': 'es-MX,es;q=0.9,en;q=0.8',
      ...(options.referer ? { referer: options.referer } : {}),
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 25_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} al consultar ${new URL(url).hostname}.`)
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType && !/html|text\//i.test(contentType)) throw new Error(`El proveedor devolvió ${contentType} cuando se esperaba HTML.`)
  return { html: await response.text(), finalUrl: response.url || url }
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
