import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { execa } from 'execa'
import type { DownloadedMedia } from '../utils/message.js'

export type StickerEffect = 'normal' | 'fliph' | 'flipv' | 'rotate90' | 'rotate180' | 'rotate270' | 'zoomin' | 'zoomout' | 'circle' | 'square' | 'grayscale'
export type StickerMetadata = { packName: string; publisher: string }

async function applyImageEffect(buffer: Buffer, effect: StickerEffect) {
  let image = sharp(buffer, { animated: false }).rotate()
  switch (effect) {
    case 'fliph': return image.flop().png().toBuffer()
    case 'flipv': return image.flip().png().toBuffer()
    case 'rotate90': return image.rotate(90).png().toBuffer()
    case 'rotate180': return image.rotate(180).png().toBuffer()
    case 'rotate270': return image.rotate(270).png().toBuffer()
    case 'grayscale': return image.grayscale().png().toBuffer()
    case 'zoomin': return image.resize(620, 620, { fit: 'cover' }).extract({ left: 54, top: 54, width: 512, height: 512 }).png().toBuffer()
    case 'zoomout': return image.resize(380, 380, { fit: 'contain' }).extend({ top: 66, bottom: 66, left: 66, right: 66, background: '#00000000' }).png().toBuffer()
    case 'square': return image.resize(512, 512, { fit: 'contain', background: '#000000' }).png().toBuffer()
    case 'circle': {
      const base = await image.resize(512, 512, { fit: 'cover' }).png().toBuffer()
      const mask = Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="white"/></svg>')
      return sharp(base).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
    }
    default: return buffer
  }
}

async function imageSticker(buffer: Buffer, effect: StickerEffect) {
  const source = await applyImageEffect(buffer, effect)
  return sharp(source, { animated: false })
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 80, effort: 5 })
    .toBuffer()
}

async function videoSticker(buffer: Buffer) {
  const { stdout } = await execa('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
    '-t', '6', '-vf', 'fps=15,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
    '-an', '-vcodec', 'libwebp', '-lossless', '0', '-compression_level', '6', '-q:v', '55',
    '-loop', '0', '-f', 'webp', 'pipe:1',
  ], {
    input: buffer,
    encoding: 'buffer',
    maxBuffer: 30 * 1024 * 1024,
    timeout: 60_000,
  })
  return Buffer.from(stdout)
}

function stickerExif(metadata: StickerMetadata) {
  const json = Buffer.from(JSON.stringify({
    'sticker-pack-id': `com.ghostnexora.${metadata.packName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 48) || 'default'}`,
    'sticker-pack-name': metadata.packName,
    'sticker-pack-publisher': metadata.publisher,
    emojis: ['👻'],
  }), 'utf8')
  const header = Buffer.from([
    0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00,
    0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ])
  header.writeUInt32LE(json.length, 14)
  return Buffer.concat([header, json])
}

async function embedStickerMetadata(webp: Buffer, metadata?: StickerMetadata) {
  if (!metadata) return webp
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-sticker-'))
  const input = path.join(dir, 'input.webp')
  const exif = path.join(dir, 'metadata.exif')
  const output = path.join(dir, 'output.webp')
  try {
    await writeFile(input, webp)
    await writeFile(exif, stickerExif(metadata))
    await execa('webpmux', ['-set', 'exif', exif, input, '-o', output], { timeout: 20_000 })
    return await readFile(output)
  } catch {
    // La creación de stickers no debe fallar si una instalación antigua no tiene webpmux.
    return webp
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function mediaToSticker(media: DownloadedMedia, effect: StickerEffect = 'normal', metadata?: StickerMetadata): Promise<Buffer> {
  let webp: Buffer
  if (media.kind === 'video') {
    if (media.buffer.byteLength > 20 * 1024 * 1024) throw new Error('El video es demasiado grande para convertirlo en sticker. Usa un clip corto.')
    if (effect !== 'normal') throw new Error('Los efectos de esta versión se aplican a imágenes; para video usa sticker normal.')
    webp = await videoSticker(media.buffer)
  } else {
    if (media.kind !== 'image') throw new Error('Envía o responde a una imagen/video.')
    webp = await imageSticker(media.buffer, effect)
  }
  return embedStickerMetadata(webp, metadata)
}

export async function stickerToPng(media: DownloadedMedia): Promise<Buffer> {
  if (media.kind !== 'sticker') throw new Error('Responde a un sticker con este comando.')
  return sharp(media.buffer, { animated: false }).png().toBuffer()
}
