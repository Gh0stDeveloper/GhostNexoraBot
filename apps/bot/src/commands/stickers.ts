import type { BotCommand } from '../types.js'
import { downloadMessageMedia } from '../utils/message.js'
import { mediaToSticker, stickerToPng } from '../services/sticker.js'

export const stickerCommands: BotCommand[] = [
  {
    name: 'sticker',
    aliases: ['s', 'stiker'],
    category: 'stickers',
    description: 'Convierte una imagen o video en sticker.',
    usage: 'sticker (respondiendo a imagen/video)',
    async handler(ctx) {
      const media = await downloadMessageMedia(ctx.message)
      if (!media || !['image', 'video'].includes(media.kind)) {
        throw new Error('Envía o responde a una imagen/video con el comando.')
      }
      await ctx.reply('🎨 Creando sticker...')
      const sticker = await mediaToSticker(media)
      await ctx.socket.sendMessage(ctx.chatId, { sticker }, { quoted: ctx.message })
    },
  },
  {
    name: 'toimg',
    aliases: ['toimage'],
    category: 'stickers',
    description: 'Convierte un sticker en PNG.',
    async handler(ctx) {
      const media = await downloadMessageMedia(ctx.message)
      if (!media) throw new Error('Responde a un sticker con este comando.')
      const image = await stickerToPng(media)
      await ctx.socket.sendMessage(ctx.chatId, { image, caption: '🖼️ Sticker convertido a PNG.' }, { quoted: ctx.message })
    },
  },
]
