import type { BotCommand } from '../types.js'
import { downloadMessageMedia } from '../utils/message.js'
import { mediaToSticker, stickerToPng, type StickerEffect } from '../services/sticker.js'
import { stickerPreferences } from '../services/sticker-preferences.js'
import { createCharacterSprite } from '../services/sprite.js'

const effects: Record<string, StickerEffect> = {
  normal: 'normal', fliph: 'fliph', derecha: 'fliph', flipv: 'flipv', izquierda: 'flipv',
  rotate90: 'rotate90', '90': 'rotate90', rotate180: 'rotate180', '180': 'rotate180', rotate270: 'rotate270', '270': 'rotate270',
  zoomin: 'zoomin', zoomout: 'zoomout', circle: 'circle', redondo: 'circle', square: 'square', cuadrado: 'square',
  grayscale: 'grayscale', bw: 'grayscale', bn: 'grayscale',
}

export const stickerCommands: BotCommand[] = [
  {
    name: 'sticker', aliases: ['s', 'stiker'], category: 'stickers', description: 'Convierte imagen/video en sticker usando tu pack personalizado.', usage: 'sticker [efecto]',
    async handler(ctx) {
      const media = await downloadMessageMedia(ctx.message)
      if (!media || !['image', 'video'].includes(media.kind)) throw new Error('Envía o responde a una imagen/video con el comando.')
      const effectName = (ctx.args[0] ?? 'normal').toLowerCase()
      const effect = effects[effectName]
      if (!effect) throw new Error(`Efecto inválido. Consulta ${ctx.prefix}stickereffects.`)
      const metadata = stickerPreferences.get(ctx.sender)
      const sticker = await mediaToSticker(media, effect, metadata)
      await ctx.socket.sendMessage(ctx.chatId, { sticker }, { quoted: ctx.message })
    },
  },
  {
    name: 'spack', aliases: ['stickerpack', 'packname'], category: 'stickers',
    description: 'Configura el nombre del pack que se incrusta en tus stickers.', usage: 'spack <nombre> | spack reset',
    async handler(ctx) {
      const input = ctx.argText.trim()
      if (!input) {
        const current = stickerPreferences.get(ctx.sender)
        await ctx.reply(`🎨 *TU PACK DE STICKERS*\n━━━━━━━━━━━━━━\nPack: *${current.packName}*\nAutor: *${current.publisher}*\n\nCambia el nombre con *${ctx.prefix}spack <nombre>*.`)
        return
      }
      if (['reset', 'off', 'default'].includes(input.toLowerCase())) {
        const current = stickerPreferences.reset(ctx.sender)
        await ctx.reply(`✅ Pack restablecido a *${current.packName}*.`)
        return
      }
      const current = stickerPreferences.set(ctx.sender, input)
      await ctx.reply(`✅ *PACK PERSONALIZADO*\n━━━━━━━━━━━━━━\nTus próximos stickers usarán:\n📦 *${current.packName}*\n✍️ *${current.publisher}*`)
    },
  },
  {
    name: 'sprite', aliases: ['charsprite'], category: 'stickers',
    description: 'Genera una animación corta de un personaje usando Jikan/MyAnimeList.', usage: 'sprite <personaje>',
    async handler(ctx) {
      const query = ctx.argText.trim()
      if (!query) throw new Error(`Uso: ${ctx.prefix}sprite <nombre del personaje>`)
      await ctx.reply(`🎞️ Preparando sprite animado de *${query}*...`)
      const result = await createCharacterSprite(query)
      try {
        await ctx.socket.sendMessage(ctx.chatId, {
          video: { url: result.filePath },
          gifPlayback: true,
          caption: `🎞️ *SPRITE ANIMADO*\n━━━━━━━━━━━━━━\n🌸 ${result.character.name}\n🆔 MAL: ${result.character.characterId}`,
        }, { quoted: ctx.message })
      } finally {
        await result.cleanup()
      }
    },
  },
  {
    name: 'stickereffects', aliases: ['sfx', 'stickerfx', 'efectos'], category: 'stickers', description: 'Muestra efectos disponibles para stickers.',
    async handler(ctx) {
      await ctx.reply(`🎨 *MENÚ DE EFECTOS*\n\n🔄 TRANSFORMACIONES\n• normal — sticker clásico\n• fliph — espejo horizontal\n• flipv — espejo vertical\n• rotate90 / rotate180 / rotate270\n• zoomin / zoomout\n\n⭕ FORMAS\n• circle — sticker redondo\n• square — marco cuadrado\n\n🎨 COLORES Y LUZ\n• grayscale — blanco y negro\n\n📦 Pack personalizado: *${ctx.prefix}spack <nombre>*\n🎞️ Sprite animado: *${ctx.prefix}sprite <personaje>*\n\nResponde a una imagen con: *${ctx.prefix}sticker circle*`)
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
