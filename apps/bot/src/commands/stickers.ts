import type { BotCommand } from '../types.js'
import { downloadMessageMedia } from '../utils/message.js'
import { mediaToSticker, stickerToPng, type StickerEffect } from '../services/sticker.js'

const effects: Record<string, StickerEffect> = {
  normal: 'normal', fliph: 'fliph', derecha: 'fliph', flipv: 'flipv', izquierda: 'flipv',
  rotate90: 'rotate90', '90': 'rotate90', rotate180: 'rotate180', '180': 'rotate180', rotate270: 'rotate270', '270': 'rotate270',
  zoomin: 'zoomin', zoomout: 'zoomout', circle: 'circle', redondo: 'circle', square: 'square', cuadrado: 'square',
  grayscale: 'grayscale', bw: 'grayscale', bn: 'grayscale',
}

export const stickerCommands: BotCommand[] = [
  {
    name: 'sticker', aliases: ['s', 'stiker'], category: 'stickers', description: 'Convierte imagen/video en sticker.', usage: 'sticker [efecto]',
    async handler(ctx) {
      const media = await downloadMessageMedia(ctx.message)
      if (!media || !['image', 'video'].includes(media.kind)) throw new Error('Envía o responde a una imagen/video con el comando.')
      const effectName = (ctx.args[0] ?? 'normal').toLowerCase()
      const effect = effects[effectName]
      if (!effect) throw new Error(`Efecto inválido. Consulta ${ctx.prefix}stickereffects.`)
      const sticker = await mediaToSticker(media, effect)
      await ctx.socket.sendMessage(ctx.chatId, { sticker }, { quoted: ctx.message })
    },
  },
  {
    name: 'stickereffects', aliases: ['sfx', 'stickerfx', 'efectos'], category: 'stickers', description: 'Muestra efectos disponibles para stickers.',
    async handler(ctx) {
      await ctx.reply(`🎨 *MENÚ DE EFECTOS*\n\n🔄 TRANSFORMACIONES\n• normal — sticker clásico\n• fliph — espejo horizontal\n• flipv — espejo vertical\n• rotate90 / rotate180 / rotate270\n• zoomin / zoomout\n\n⭕ FORMAS\n• circle — sticker redondo\n• square — marco cuadrado\n\n🎨 COLORES Y LUZ\n• grayscale — blanco y negro\n\nResponde a una imagen con: *${ctx.prefix}sticker circle*`)
    },
  },
  {
    name: 'toimg', aliases: ['toimage'], category: 'stickers', description: 'Convierte un sticker en PNG.',
    async handler(ctx) {
      const media = await downloadMessageMedia(ctx.message)
      if (!media) throw new Error('Responde a un sticker con este comando.')
      const image = await stickerToPng(media)
      await ctx.socket.sendMessage(ctx.chatId, { image, caption: '🖼️ Sticker convertido a PNG.' }, { quoted: ctx.message })
    },
  },
]
