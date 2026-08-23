import type { BotCommand, CommandContext } from '../types.js'
import { downloadMessageMedia } from '../utils/message.js'
import { globalStickers } from '../services/human-stickers.js'

async function botSticker(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'list').toLowerCase()
  if (action === 'list') {
    const rows = globalStickers.list()
    const text = rows.length
      ? rows.map((row) => {
          const triggers = (row.triggers ?? '').split('|').filter(Boolean)
          return `#${row.id} · *${row.label ?? 'sin etiqueta'}*${triggers.length ? `\n   Palabras/frases: ${triggers.map((x) => `“${x}”`).join(', ')}` : '\n   Sin palabras: aparición aleatoria ocasional'} `
        }).join('\n\n')
      : 'No hay stickers globales configurados.'
    await ctx.reply(`🎭 *BIBLIOTECA GLOBAL DE STICKERS*\n━━━━━━━━━━━━━━\n${text}\n\nTodos los stickers de esta biblioteca son globales para el bot.\nAñadir: *${ctx.prefix}botsticker add etiqueta | palabra,frase completa*\nEliminar: *${ctx.prefix}botsticker remove <id>*`)
    return
  }
  if (action === 'remove' || action === 'delete') {
    const id = Number(ctx.args[1])
    if (!Number.isInteger(id) || id <= 0) throw new Error('Indica el ID del sticker global que quieres eliminar.')
    await globalStickers.remove(id)
    await ctx.reply(`✅ Sticker global *#${id}* eliminado.`)
    return
  }
  if (action === 'add') {
    const media = await downloadMessageMedia(ctx.message)
    if (!media || media.kind !== 'sticker') throw new Error('Responde directamente al sticker que deseas añadir a la biblioteca global.')
    const raw = ctx.args.slice(1).join(' ')
    const [labelRaw = '', triggerRaw = ''] = raw.split('|')
    const label = labelRaw.trim() || undefined
    const triggers = triggerRaw.split(',').map((item) => item.trim()).filter(Boolean)
    const row = await globalStickers.add(media.buffer, ctx.sender, globalStickers.hashFromMessage(ctx.message), label, triggers)
    await ctx.reply([
      `✅ *STICKER GLOBAL #${row.id} AÑADIDO*`,
      label ? `🏷️ Etiqueta: *${label}*` : '',
      triggers.length ? `💬 Puede reaccionar a: ${triggers.map((x) => `“${globalStickers.normalizeTrigger(x)}”`).join(', ')}` : '🎲 Sin palabras asociadas: puede aparecer ocasionalmente de forma aleatoria.',
      '',
      'Las coincidencias ignoran mayúsculas, acentos y signos; las palabras cortas ya no coinciden dentro de otras palabras.',
    ].filter(Boolean).join('\n'))
    return
  }
  throw new Error(`Usa ${ctx.prefix}botsticker add [etiqueta | palabra,frase], list o remove <id>.`)
}

async function kickSticker(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'status').toLowerCase()
  if (action === 'clear' || action === 'off') {
    globalStickers.clearAction('kick')
    await ctx.reply('✅ Sticker global de expulsión desactivado.')
    return
  }
  if (action === 'set') {
    const media = await downloadMessageMedia(ctx.message)
    if (!media || media.kind !== 'sticker') throw new Error('Responde directamente al sticker que deseas usar como sticker global de expulsión.')
    const result = await globalStickers.setAction('kick', media.buffer, ctx.sender, globalStickers.hashFromMessage(ctx.message))
    await ctx.reply(`✅ *STICKER DE EXPULSIÓN CONFIGURADO*\n━━━━━━━━━━━━━━\nLa identificación quedó guardada por contenido${result.waSha ? ' y huella de WhatsApp' : ''}.\n\nUn administrador o staff podrá enviar ese sticker *respondiendo al mensaje del usuario* que desea expulsar.`)
    return
  }
  await ctx.reply(`🚫 *STICKER GLOBAL DE EXPULSIÓN*\nConfigurar: *${ctx.prefix}kicksticker set* respondiendo al sticker.\nUsar: envía ese sticker respondiendo al mensaje del miembro.\nDesactivar: *${ctx.prefix}kicksticker clear*`)
}

export const stickerAdminV5Commands: BotCommand[] = [
  { name: 'botsticker', aliases: ['globalsticker'], category: 'owner', staffOnly: true, description: 'Administra la biblioteca global de stickers y sus palabras/frases.', handler: botSticker },
  { name: 'kicksticker', aliases: ['stickerkick'], category: 'owner', staffOnly: true, description: 'Configura el sticker global de expulsión por contenido y huella.', handler: kickSticker },
]
