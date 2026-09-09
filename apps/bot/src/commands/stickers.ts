import type { BotCommand } from '../types.js'
import { downloadMessageMedia } from '../utils/message.js'
import { mediaToSticker, stickerToPng, type StickerEffect } from '../services/sticker.js'
import { stickerPreferences } from '../services/sticker-preferences.js'
import { createCharacterSprite } from '../services/sprite.js'
import { mediaToValleySticker, type ValleyStickerMode } from '../services/valley-sticker-v21.js'

const effects: Record<string, StickerEffect> = {
  normal: 'normal', fliph: 'fliph', derecha: 'fliph', flipv: 'flipv', izquierda: 'flipv',
  rotate90: 'rotate90', '90': 'rotate90', rotate180: 'rotate180', '180': 'rotate180', rotate270: 'rotate270', '270': 'rotate270',
  zoomin: 'zoomin', zoomout: 'zoomout', circle: 'circle', redondo: 'circle', square: 'square', cuadrado: 'square',
  grayscale: 'grayscale', bw: 'grayscale', bn: 'grayscale',
}

const valleyModes: Record<string, ValleyStickerMode> = {
  ajustar: 'crop', encajar: 'crop', encaixar: 'crop', crop: 'crop',
  barras: 'bars', bars: 'bars',
  estirar: 'stretch', forzar: 'stretch', 'forçar': 'stretch', stretch: 'stretch',
}

export const stickerCommands: BotCommand[] = [
  {
    name: 'sticker', aliases: ['s', 'stiker'], category: 'stickers', description: 'Convierte imagen, GIF o video corto en sticker usando tu pack personalizado.', usage: 'sticker [efecto]',
    async handler(ctx) {
      const media = await downloadMessageMedia(ctx.message)
      if (!media || !['image', 'video'].includes(media.kind)) throw new Error('Envía o responde a una imagen, GIF o video corto con el comando.')
      const effectName = (ctx.args[0] ?? 'normal').toLowerCase()
      const metadata = stickerPreferences.get(ctx.sender)
      const valleyMode = valleyModes[effectName]
      if (valleyMode) {
        const sticker = await mediaToValleySticker(media, valleyMode, metadata)
        await ctx.socket.sendMessage(ctx.chatId, { sticker }, { quoted: ctx.message })
        return
      }
      const effect = effects[effectName]
      if (!effect) throw new Error(`Efecto inválido. Consulta ${ctx.prefix}stickereffects.`)
      const sticker = await mediaToSticker(media, effect, metadata)
      await ctx.socket.sendMessage(ctx.chatId, { sticker }, { quoted: ctx.message })
    },
  },
  {
    name: 'spack', aliases: ['stickerpack', 'packname'], category: 'stickers',
    description: 'Configura nombre del pack y opcionalmente alias del autor.', usage: 'spack <nombre> | <autor> | spack reset',
    async handler(ctx) {
      const input = ctx.argText.trim()
      if (!input) {
        const current = stickerPreferences.get(ctx.sender)
        await ctx.reply(`🎨 *TU PACK DE STICKERS*\n━━━━━━━━━━━━━━\n📦 Pack: *${current.packName}*\n✍️ Autor: *${current.publisher}*\n\nCambia el pack con *${ctx.prefix}spack <nombre>*.\nPack + autor: *${ctx.prefix}spack Mi Pack | Mi Alias*.\nSolo autor: *${ctx.prefix}sauthor <alias>*.`)
        return
      }
      if (['reset', 'off', 'default'].includes(input.toLowerCase())) {
        const current = stickerPreferences.reset(ctx.sender)
        await ctx.reply(`✅ *PACK RESTABLECIDO*\n📦 ${current.packName}\n✍️ ${current.publisher}`)
        return
      }
      const [packPart = '', ...authorParts] = input.split('|')
      const author = authorParts.join('|').trim() || undefined
      const current = stickerPreferences.set(ctx.sender, packPart.trim(), author)
      await ctx.reply(`✅ *PACK PERSONALIZADO*\n━━━━━━━━━━━━━━\nTus próximos stickers usarán:\n📦 *${current.packName}*\n✍️ *${current.publisher}*`)
    },
  },
  {
    name: 'sauthor', aliases: ['stickerauthor', 'packauthor', 'sautor'], category: 'stickers',
    description: 'Configura el alias de autor que se incrusta en tus stickers.', usage: 'sauthor <alias>',
    async handler(ctx) {
      const alias = ctx.argText.trim()
      if (!alias) {
        const current = stickerPreferences.get(ctx.sender)
        await ctx.reply(`✍️ *AUTOR DEL PACK*\nActual: *${current.publisher}*\n\nCámbialo con *${ctx.prefix}sauthor <alias>*.`)
        return
      }
      const current = stickerPreferences.setPublisher(ctx.sender, alias)
      await ctx.reply(`✅ Autor actualizado a *${current.publisher}*.\n📦 Pack: *${current.packName}*`)
    },
  },
  {
    name: 'sprite', aliases: ['charsprite'], category: 'stickers',
    description: 'Genera una animación corta de un personaje usando AniList.', usage: 'sprite <personaje>',
    async handler(ctx) {
      const query = ctx.argText.trim()
      if (!query) throw new Error(`Uso: ${ctx.prefix}sprite <nombre del personaje>`)
      await ctx.reply(`🎞️ Preparando sprite animado de *${query}*...`)
      const result = await createCharacterSprite(query)
      try {
        await ctx.socket.sendMessage(ctx.chatId, {
          video: { url: result.filePath },
          gifPlayback: true,
          caption: `🎞️ *SPRITE ANIMADO*\n━━━━━━━━━━━━━━\n🌸 ${result.character.name}\n🆔 AniList: AL-${result.character.aniListId}`,
        }, { quoted: ctx.message })
      } finally {
        await result.cleanup()
      }
    },
  },
  {
    name: 'stickereffects', aliases: ['sfx', 'stickerfx', 'efectos'], category: 'stickers', description: 'Muestra efectos y configuración disponible para stickers.',
    async handler(ctx) {
      const current = stickerPreferences.get(ctx.sender)
      await ctx.reply(`🎨 *MENÚ DE STICKERS*\n\n🔄 TRANSFORMACIONES\n• normal — sticker clásico\n• fliph — espejo horizontal\n• flipv — espejo vertical\n• rotate90 / rotate180 / rotate270\n• zoomin / zoomout\n\n📐 ENCUADRE VALLEY\n• ajustar / encajar / encaixar — llena 512×512 y recorta el excedente\n• barras — conserva proporción y agrega barras negras\n• estirar / forzar — fuerza la imagen a 512×512\n\n⭕ FORMAS\n• circle — sticker redondo\n• square — marco cuadrado\n\n🎨 COLORES Y LUZ\n• grayscale — blanco y negro\n\n🎞️ GIF/VIDEO\n• Se aceptan clips cortos de hasta 6 segundos\n• Los modos Valley también funcionan con GIF/video\n• El bot comprime y valida el WebP antes de enviarlo\n\n📦 Pack actual: *${current.packName}*\n✍️ Autor: *${current.publisher}*\n\nConfigura: *${ctx.prefix}spack <nombre> | <autor>*\nSolo autor: *${ctx.prefix}sauthor <alias>*\nEjemplo: responde a una imagen con *${ctx.prefix}sticker barras*`)
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
