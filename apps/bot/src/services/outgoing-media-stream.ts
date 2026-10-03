import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { OutgoingMedia } from '@ghostnexora/platform-contracts'

export type OutgoingMediaStreamSource = {
  size?: number
  open: () => Promise<AsyncIterable<Uint8Array>>
}

async function* enforceLimit(
  source: AsyncIterable<Uint8Array>,
  maxBytes: number,
  platform: string,
) {
  let total = 0
  for await (const raw of source) {
    const chunk = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
    total += chunk.byteLength
    if (total > maxBytes) throw new Error(`El archivo supera el límite seguro de subida de ${platform} (${maxBytes} bytes).`)
    yield chunk
  }
}

export async function outgoingMediaStreamSource(
  media: OutgoingMedia,
  maxBytes: number,
  platform: string,
): Promise<OutgoingMediaStreamSource> {
  if (media.source.kind === 'bytes') {
    if (media.source.value.byteLength > maxBytes) {
      throw new Error(`El archivo supera el límite seguro de subida de ${platform} (${maxBytes} bytes).`)
    }
    const bytes = media.source.value
    return {
      size: bytes.byteLength,
      open: async () => enforceLimit((async function* () { yield bytes })(), maxBytes, platform),
    }
  }

  if (media.source.kind === 'path') {
    const info = await stat(media.source.value)
    if (!info.isFile()) throw new Error('La ruta multimedia no apunta a un archivo regular.')
    if (info.size > maxBytes) {
      throw new Error(`El archivo supera el límite seguro de subida de ${platform} (${maxBytes} bytes).`)
    }
    const path = media.source.value
    return {
      size: info.size,
      open: async () => enforceLimit(createReadStream(path) as AsyncIterable<Uint8Array>, maxBytes, platform),
    }
  }

  const url = media.source.value
  return {
    open: async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
      if (!response.ok) throw new Error(`No se pudo descargar media para ${platform} (${response.status}).`)
      const declared = Number(response.headers.get('content-length') || 0)
      if (declared > maxBytes) {
        throw new Error(`El archivo remoto supera el límite seguro de subida de ${platform}.`)
      }
      if (!response.body) throw new Error(`La respuesta multimedia de ${platform} no contiene cuerpo.`)
      return enforceLimit(response.body as unknown as AsyncIterable<Uint8Array>, maxBytes, platform)
    },
  }
}
