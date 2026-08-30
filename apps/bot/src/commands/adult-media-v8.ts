import type { BotCommand, CommandContext } from '../types.js'
import { downloadMessageMedia } from '../utils/message.js'
import {
  addAdultReactionMedia,
  adultMediaCommandAllowed,
  clearAdultReactionMedia,
  importAdultReactionMediaFromUrl,
  listAdultReactionMedia,
  listAllowedAdultMediaCommands,
  removeAdultReactionMedia,
} from '../services/adult-media-v8.js'

function requireStaff(ctx: CommandContext) {
  if (!ctx.isBotStaff && !ctx.isOwner && !ctx.isSubbotOwner) {
    throw new Error('Solo staff, owner o dueño del subbot puede administrar estos medios.')
  }
}

async function add(ctx: CommandContext) {
  requireStaff(ctx)
  const command = ctx.args[0]
  if (!command || !adultMediaCommandAllowed(command)) {
    throw new Error(
      `Uso: ${ctx.prefix}adultgif add <comando> · responde al GIF/video no explícito de menores.\nComandos: ${listAllowedAdultMediaCommands().join(', ')}\nMáximo: 25 medios por comando (incluye pool global/hentai).`,
    )
  }
  const media = await downloadMessageMedia(ctx.message)
  if (!media || (media.kind !== 'video' && media.kind !== 'image')) {
    throw new Error('Responde al GIF/video/archivo de reacción que deseas guardar.')
  }
  const mimetype = media.mimetype ?? 'video/mp4'
  if (!/^video\//i.test(mimetype) && !/gif/i.test(mimetype) && !/^image\//i.test(mimetype)) {
    throw new Error('Formato no reconocido.')
  }
  const saved = await addAdultReactionMedia(command, media.buffer, mimetype, ctx.sender, media.fileName ?? undefined)
  await ctx.reply(
    `✅ *MEDIO GUARDADO*\n━━━━━━━━━━━━━━\nComando: *${saved.command}*\nID: *${saved.id}*\nGuardados: *${saved.count}/25*`,
  )
}

async function importUrls(ctx: CommandContext) {
  requireStaff(ctx)
  const command = ctx.args[0]
  const urls = ctx.args.slice(1).filter((u) => /^https?:\/\//i.test(u))
  if (!command || !adultMediaCommandAllowed(command) || !urls.length) {
    throw new Error(
      `Uso: ${ctx.prefix}adultgif import <comando> <url> [url2] ...\nMáximo recomendado: 5 URLs por mensaje. Comandos: ${listAllowedAdultMediaCommands().join(', ')}`,
    )
  }

  const limited = urls.slice(0, 5)
  await ctx.reply(`⬇️ Importando *${limited.length}* medio(s) para *${command}*...`)
  const ok: number[] = []
  const fail: string[] = []

  for (const url of limited) {
    try {
      const saved = await importAdultReactionMediaFromUrl(command, url, ctx.sender)
      ok.push(saved.id)
    } catch (error) {
      fail.push(`${url.slice(0, 60)}… → ${error instanceof Error ? error.message : 'error'}`)
    }
  }

  await ctx.reply(
    [
      '🎞️ *IMPORTACIÓN DE MEDIOS*',
      '━━━━━━━━━━━━━━',
      `Comando: *${command}*`,
      `✅ Importados: ${ok.length}${ok.length ? ` (IDs ${ok.join(', ')})` : ''}`,
      fail.length ? `❌ Fallidos: ${fail.length}\n${fail.slice(0, 5).join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )
}

async function list(ctx: CommandContext) {
  requireStaff(ctx)
  const rows = listAdultReactionMedia(ctx.args[0]) as Array<{
    id: number
    command: string
    label?: string
    mimeType: string
  }>
  if (!rows.length) throw new Error('No hay medios guardados para esa reacción.')
  await ctx.reply(
    `🎞️ *MEDIOS DE REACCIÓN*\n━━━━━━━━━━━━━━\n${rows.map((r) => `#${r.id} · ${r.command} · ${r.label || r.mimeType}`).join('\n')}`,
  )
}

async function remove(ctx: CommandContext) {
  requireStaff(ctx)
  const id = Number(ctx.args[0])
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Uso: ${ctx.prefix}adultgif remove <id>`)
  await removeAdultReactionMedia(id)
  await ctx.reply(`🗑️ Medio *#${id}* eliminado.`)
}

async function clear(ctx: CommandContext) {
  requireStaff(ctx)
  const command = ctx.args[0]
  if (!command || !adultMediaCommandAllowed(command)) {
    throw new Error(`Uso: ${ctx.prefix}adultgif clear <comando>`)
  }
  await clearAdultReactionMedia(command)
  await ctx.reply(`🧹 Medios de *${command}* eliminados.`)
}

async function help(ctx: CommandContext) {
  requireStaff(ctx)
  await ctx.reply(
    [
      '🎞️ *ADULT REACTION MEDIA*',
      '━━━━━━━━━━━━━━',
      `${ctx.prefix}adultgif add <comando> → responde al archivo`,
      `${ctx.prefix}adultgif import <comando> <url> [url2…]`,
      `${ctx.prefix}adultgif list [comando]`,
      `${ctx.prefix}adultgif remove <id>`,
      `${ctx.prefix}adultgif clear <comando>`,
      '',
      `Comandos: ${listAllowedAdultMediaCommands().join(', ')}`,
      'Máximo: *25* medios por comando.',
      'Pools compartidos: *global*, *hentai* (fallback de cualquier roleplay).',
      '',
      'Los comandos de roleplay usan medios cargados por staff o reacciones externas NSFW solo con consentimiento mutuo. Sin medios locales se usa un fallback SFW.',
    ].join('\n'),
  )
}

export const adultMediaV8Commands: BotCommand[] = [
  {
    name: 'adultgif',
    aliases: ['reactiongif', 'adultmedia'],
    category: 'adult',
    staffOnly: true,
    description: 'Administra medios de reacción 18+ (locales + import por URL) por comando.',
    usage: 'adultgif add|import|list|remove|clear|help',
    handler: async (ctx) => {
      const action = (ctx.args[0] || 'help').toLowerCase()
      if (action === 'add') {
        await add(ctx)
        return
      }
      if (action === 'import') {
        // shift so args[0] becomes command name
        ctx.args = ctx.args.slice(1)
        await importUrls(ctx)
        return
      }
      if (action === 'list') {
        ctx.args = ctx.args.slice(1)
        await list(ctx)
        return
      }
      if (action === 'remove') {
        ctx.args = ctx.args.slice(1)
        await remove(ctx)
        return
      }
      if (action === 'clear') {
        ctx.args = ctx.args.slice(1)
        await clear(ctx)
        return
      }
      await help(ctx)
    },
  },
]
