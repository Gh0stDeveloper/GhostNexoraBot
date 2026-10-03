import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import type { NormalizedMediaKind, OutgoingMedia, OutgoingMediaSource } from '@ghostnexora/platform-contracts'
import { recordGroupedError } from './error-groups.js'
import { currentCorrelationId } from './trace-context.js'
import { recordOpsRuntimeLog } from './ops-runtime-log.js'

export type MediaPipelineMode = 'direct' | 'stream' | 'materialize'

export type MediaPipelinePrepared = {
  media: OutgoingMedia
  size?: number
  fileName: string
  mimeType: string
  source: OutgoingMediaSource
  openStream: () => Promise<AsyncIterable<Uint8Array>>
  cleanup: () => Promise<void>
}

export type MediaTranscodeResult = {
  path: string
  fileName?: string
  mimeType?: string
  cleanup?: () => Promise<void>
}

export type MediaPipelineOptions = {
  platform: string
  maxBytes: number
  mode?: MediaPipelineMode
  timeoutMs?: number
  retries?: number
  transcode?: (input: { path: string; fileName: string; mimeType: string; kind: NormalizedMediaKind }) => Promise<MediaTranscodeResult | null>
}

const MIME_BY_KIND: Record<NormalizedMediaKind, string> = {
  image: 'image/jpeg',
  video: 'video/mp4',
  audio: 'audio/mpeg',
  document: 'application/octet-stream',
  sticker: 'image/webp',
}

const EXT_BY_KIND: Record<NormalizedMediaKind, string> = {
  image: 'jpg',
  video: 'mp4',
  audio: 'mp3',
  document: 'bin',
  sticker: 'webp',
}

function fallbackFileName(media: OutgoingMedia) {
  return media.fileName?.trim() || `ghost-nexora-${Date.now()}.${EXT_BY_KIND[media.kind]}`
}

function inferMime(media: OutgoingMedia) {
  return media.mimeType?.trim() || MIME_BY_KIND[media.kind]
}

function validateUrl(value: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('MediaPipeline solo admite URLs HTTP/HTTPS.')
  return url
}

async function* limited(source: AsyncIterable<Uint8Array>, maxBytes: number, platform: string) {
  let total = 0
  for await (const raw of source) {
    const chunk = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
    total += chunk.byteLength
    if (total > maxBytes) throw new Error(`El archivo supera el límite seguro de subida de ${platform} (${maxBytes} bytes).`)
    yield chunk
  }
}

async function remoteStream(url: string, options: MediaPipelineOptions) {
  const attempts = Math.max(1, Math.min(4, Math.trunc((options.retries ?? 2) + 1)))
  let last: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(options.timeoutMs ?? 120_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const declared = Number(response.headers.get('content-length') || 0)
      if (declared > options.maxBytes) throw new Error(`El archivo remoto supera el límite seguro de subida de ${options.platform}.`)
      if (!response.body) throw new Error('Respuesta multimedia vacía.')
      return {
        stream: limited(response.body as unknown as AsyncIterable<Uint8Array>, options.maxBytes, options.platform),
        mimeType: response.headers.get('content-type')?.split(';')[0]?.trim() || undefined,
        size: declared > 0 ? declared : undefined,
      }
    } catch (error) {
      last = error
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500))
    }
  }
  throw last instanceof Error ? last : new Error(String(last ?? 'media_download_failed'))
}

async function materializeRemote(media: OutgoingMedia, options: MediaPipelineOptions, fileName: string, mimeType: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-media-'))
  const filePath = path.join(dir, path.basename(fileName))
  try {
    const remote = await remoteStream(media.source.kind === 'url' ? media.source.value : '', options)
    let total = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        total += chunk.length
        if (total > options.maxBytes) callback(new Error(`El archivo supera el límite seguro de subida de ${options.platform}.`))
        else callback(null, chunk)
      },
    })
    await pipeline(remote.stream, limiter, createWriteStream(filePath, { mode: 0o600 }))
    let finalPath = filePath
    let finalName = fileName
    let finalMime = remote.mimeType || mimeType
    let transcodeCleanup: (() => Promise<void>) | undefined
    if (options.transcode) {
      const result = await options.transcode({ path: filePath, fileName, mimeType: finalMime, kind: media.kind })
      if (result) {
        finalPath = result.path
        finalName = result.fileName || finalName
        finalMime = result.mimeType || finalMime
        transcodeCleanup = result.cleanup
      }
    }
    const info = await stat(finalPath)
    if (info.size > options.maxBytes) throw new Error(`El archivo transcodificado supera el límite seguro de ${options.platform}.`)
    const source: OutgoingMediaSource = { kind: 'path', value: finalPath }
    return {
      source,
      size: info.size,
      fileName: finalName,
      mimeType: finalMime,
      cleanup: async () => {
        await transcodeCleanup?.().catch(() => undefined)
        await rm(dir, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

export async function prepareOutgoingMedia(media: OutgoingMedia, options: MediaPipelineOptions): Promise<MediaPipelinePrepared> {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) throw new Error('MediaPipeline maxBytes inválido.')
  const mode = options.mode ?? 'direct'
  let fileName = fallbackFileName(media)
  let mimeType = inferMime(media)
  let source = media.source
  let size: number | undefined
  let cleanup = async () => {}

  if (source.kind === 'bytes') {
    size = source.value.byteLength
    if (size > options.maxBytes) throw new Error(`El archivo supera el límite seguro de subida de ${options.platform}.`)
  } else if (source.kind === 'path') {
    const info = await stat(source.value)
    if (!info.isFile()) throw new Error('La ruta multimedia no apunta a un archivo regular.')
    size = info.size
    if (size > options.maxBytes) throw new Error(`El archivo supera el límite seguro de subida de ${options.platform}.`)
    if (!media.fileName) fileName = path.basename(source.value) || fileName
  } else {
    validateUrl(source.value)
    if (!media.fileName) {
      try {
        const candidate = path.basename(new URL(source.value).pathname)
        if (candidate) fileName = candidate
      } catch {}
    }
    if (mode === 'materialize') {
      const prepared = await materializeRemote(media, options, fileName, mimeType)
      source = prepared.source
      size = prepared.size
      fileName = prepared.fileName
      mimeType = prepared.mimeType
      cleanup = prepared.cleanup
    }
  }

  const normalized: OutgoingMedia = {
    ...media,
    source,
    fileName,
    mimeType,
  }

  const openStream = async () => {
    if (source.kind === 'bytes') return limited((async function* () { yield source.value })(), options.maxBytes, options.platform)
    if (source.kind === 'path') return limited(createReadStream(source.value) as AsyncIterable<Uint8Array>, options.maxBytes, options.platform)
    return (await remoteStream(source.value, options)).stream
  }

  return { media: normalized, source, size, fileName, mimeType, openStream, cleanup }
}

export async function withPreparedMedia<T>(
  media: OutgoingMedia,
  options: MediaPipelineOptions,
  operation: (prepared: MediaPipelinePrepared) => Promise<T>,
) {
  const correlationId = currentCorrelationId()
  const started = performance.now()
  try {
    const prepared = await prepareOutgoingMedia(media, options)
    try {
      const result = await operation(prepared)
      recordOpsRuntimeLog('debug', 'media-pipeline', `media_ok · platform=${options.platform} · kind=${media.kind} · latency=${Math.round(performance.now() - started)}ms · correlation=${correlationId ?? 'none'}`, undefined, 'download')
      return result
    } finally {
      await prepared.cleanup()
    }
  } catch (error) {
    recordGroupedError(error, { platform: options.platform.toLowerCase(), correlationId })
    recordOpsRuntimeLog('error', 'media-pipeline', `media_failed · platform=${options.platform} · kind=${media.kind} · correlation=${correlationId ?? 'none'}`, undefined, 'download')
    throw error
  }
}
