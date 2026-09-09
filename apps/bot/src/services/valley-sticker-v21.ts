import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import type { DownloadedMedia } from '../utils/message.js'

export type ValleyStickerMode = 'crop' | 'bars' | 'stretch'

const MAX_STATIC_BYTES = 700 * 1024
const MAX_ANIMATED_BYTES = 950 * 1024

function filterFor(mode: ValleyStickerMode) {
  if (mode === 'stretch') return 'scale=512:512:flags=lanczos'
  if (mode === 'bars') return 'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black'
  return 'scale=512:512:force_original_aspect_ratio=increase:flags=lanczos,crop=512:512'
}

function assertWebp(buffer: Buffer) {
  if (buffer.length < 16 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throw new Error('FFmpeg no generó un sticker WebP válido.')
  }
}

/**
 * Modos compatibles con ValleyBot, reimplementados sobre el pipeline actual:
 * - crop/encajar: llena 512x512 y recorta el excedente.
 * - bars/barras: conserva proporción y agrega barras negras.
 * - stretch/estirar: fuerza exactamente 512x512.
 *
 * Mantiene el límite estable de Ghost Nexora Bot para clips animados (6 s).
 */
export async function mediaToValleySticker(media: DownloadedMedia, mode: ValleyStickerMode): Promise<Buffer> {
  if (!['image', 'video'].includes(media.kind)) throw new Error('Envía o responde a una imagen, GIF o video corto.')
  if (media.buffer.length > 25 * 1024 * 1024) throw new Error('El archivo es demasiado grande para convertirlo en sticker.')

  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-valley-sticker-'))
  const input = path.join(dir, 'source.bin')
  await writeFile(input, media.buffer)
  const limit = media.kind === 'video' ? MAX_ANIMATED_BYTES : MAX_STATIC_BYTES
  let smallest: Buffer | null = null

  try {
    for (const quality of [72, 58, 46, 36]) {
      const output = path.join(dir, `sticker-${quality}.webp`)
      const videoArgs = media.kind === 'video' ? ['-t', '6'] : []
      const filter = media.kind === 'video' ? `fps=15,${filterFor(mode)}` : filterFor(mode)
      await execa('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', input,
        ...videoArgs,
        '-vf', filter,
        '-an',
        '-c:v', 'libwebp',
        '-lossless', '0',
        '-compression_level', '6',
        '-q:v', String(quality),
        '-loop', '0',
        '-preset', 'picture',
        output,
      ], { timeout: 90_000, maxBuffer: 10 * 1024 * 1024 })

      const candidate = await readFile(output)
      assertWebp(candidate)
      if (!smallest || candidate.length < smallest.length) smallest = candidate
      if (candidate.length <= limit) return candidate
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }

  if (!smallest) throw new Error('No pude generar el sticker.')
  throw new Error('El sticker resultante es demasiado pesado. Usa una imagen o clip con menos detalle/movimiento.')
}
