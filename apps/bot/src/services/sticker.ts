import sharp from 'sharp'
import { Sticker, StickerTypes } from 'wa-sticker-formatter'
import { config } from '../config.js'
import type { DownloadedMedia } from '../utils/message.js'

export type StickerEffect = 'normal' | 'fliph' | 'flipv' | 'rotate90' | 'rotate180' | 'rotate270' | 'zoomin' | 'zoomout' | 'circle' | 'square' | 'grayscale'

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
    case 'zoomout': return image.resize(380, 380, { fit: 'contain' }).extend({ top: 66, bottom: 66, left: 66, right: 66, background: '#000000' }).png().toBuffer()
    case 'square': return image.resize(512, 512, { fit: 'contain', background: '#000000' }).png().toBuffer()
    case 'circle': {
      const base = await image.resize(512, 512, { fit: 'cover' }).png().toBuffer()
      const mask = Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="white"/></svg>')
      return sharp(base).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
    }
    default: return buffer
  }
}

export async function mediaToSticker(media: DownloadedMedia, effect: StickerEffect = 'normal'): Promise<Buffer> {
  if (media.kind === 'video' && media.buffer.byteLength > 20 * 1024 * 1024) throw new Error('El video es demasiado grande para convertirlo en sticker. Usa un clip corto.')
  if (media.kind === 'video' && effect !== 'normal') throw new Error('Los efectos de esta versión se aplican a imágenes; para video usa sticker normal.')
  const source = media.kind === 'image' ? await applyImageEffect(media.buffer, effect) : media.buffer
  const sticker = new Sticker(source, {
    pack: config.botName,
    author: 'Ghost Developer',
    type: StickerTypes.FULL,
    quality: 78,
  })
  return sticker.toBuffer()
}

export async function stickerToPng(media: DownloadedMedia): Promise<Buffer> {
  if (media.kind !== 'sticker') throw new Error('Responde a un sticker con este comando.')
  return sharp(media.buffer, { animated: false }).png().toBuffer()
}
