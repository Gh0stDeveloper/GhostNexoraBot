import sharp from 'sharp'
import { Sticker, StickerTypes } from 'wa-sticker-formatter'
import { config } from '../config.js'
import type { DownloadedMedia } from '../utils/message.js'

export async function mediaToSticker(media: DownloadedMedia): Promise<Buffer> {
  if (media.kind === 'video' && media.buffer.byteLength > 20 * 1024 * 1024) {
    throw new Error('El video es demasiado grande para convertirlo en sticker. Usa un clip corto.')
  }
  const sticker = new Sticker(media.buffer, {
    pack: config.botName,
    author: 'Ghost Developer',
    type: StickerTypes.FULL,
    quality: 70,
    categories: ['👻'],
  })
  return sticker.toBuffer()
}

export async function stickerToPng(media: DownloadedMedia): Promise<Buffer> {
  if (media.kind !== 'sticker') throw new Error('Responde a un sticker con este comando.')
  return sharp(media.buffer, { animated: false }).png().toBuffer()
}
