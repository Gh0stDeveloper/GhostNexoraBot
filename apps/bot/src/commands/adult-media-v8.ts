import type { BotCommand, CommandContext } from '../types.js'
import { downloadMessageMedia } from '../utils/message.js'
import { addAdultReactionMedia, adultMediaCommandAllowed, clearAdultReactionMedia, listAdultReactionMedia, removeAdultReactionMedia } from '../services/adult-media-v8.js'

function requireStaff(ctx: CommandContext) { if (!ctx.isBotStaff && !ctx.isOwner && !ctx.isSubbotOwner) throw new Error('Solo staff, owner o dueño del subbot puede administrar estos medios.') }

async function add(ctx: CommandContext) {
  requireStaff(ctx)
  const command = ctx.args[0]
  if (!command || !adultMediaCommandAllowed(command)) throw new Error(`Uso: ${ctx.prefix}adultgif add <comando> · responde al GIF/video no explícito. Máximo 10 medios por comando.`)
  const media = await downloadMessageMedia(ctx.message)
  if (!media || (media.kind !== 'video' && media.kind !== 'image')) throw new Error('Responde al GIF/video/archivo de reacción que deseas guardar.')
  const mimetype = media.mimetype ?? 'video/mp4'
  if (!/^video\//i.test(mimetype) && !/gif/i.test(mimetype) && !/^image\//i.test(mimetype)) throw new Error('Formato no reconocido.')
  const saved = await addAdultReactionMedia(command, media.buffer, mimetype, ctx.sender, media.fileName ?? undefined)
  await ctx.reply(`✅ *MEDIO GUARDADO*\n━━━━━━━━━━━━━━\nComando: *${saved.command}*\nID: *${saved.id}*\nGuardados: *${saved.count}/10*`)
}
async function list(ctx: CommandContext) { requireStaff(ctx); const rows = listAdultReactionMedia(ctx.args[0]); if (!rows.length) throw new Error('No hay medios guardados para esa reacción.'); await ctx.reply(`🎞️ *MEDIOS DE REACCIÓN*\n━━━━━━━━━━━━━━\n${(rows as any[]).map((r) => `#${r.id} · ${r.command} · ${r.label || r.mimeType}`).join('\n')}`) }
async function remove(ctx: CommandContext) { requireStaff(ctx); const id = Number(ctx.args[0]); if (!Number.isInteger(id) || id <= 0) throw new Error(`Uso: ${ctx.prefix}adultgif remove <id>`); await removeAdultReactionMedia(id); await ctx.reply(`🗑️ Medio *#${id}* eliminado.`) }
async function clear(ctx: CommandContext) { requireStaff(ctx); const command = ctx.args[0]; if (!command || !adultMediaCommandAllowed(command)) throw new Error(`Uso: ${ctx.prefix}adultgif clear <comando>`); await clearAdultReactionMedia(command); await ctx.reply(`🧹 Medios de *${command}* eliminados.`) }
async function help(ctx: CommandContext) { requireStaff(ctx); await ctx.reply(`🎞️ *ADULT REACTION MEDIA*\n━━━━━━━━━━━━━━\n${ctx.prefix}adultgif add <comando> → responde al archivo no explícito\n${ctx.prefix}adultgif list [comando]\n${ctx.prefix}adultgif remove <id>\n${ctx.prefix}adultgif clear <comando>\n\nMáximo: *10* medios por comando.`) }

export const adultMediaV8Commands: BotCommand[] = [
  { name: 'adultgif', aliases: ['reactiongif', 'adultmedia'], category: 'adult', staffOnly: true, description: 'Administra medios de reacción 18+ no explícitos por comando.', usage: 'adultgif add|list|remove|clear', handler: async (ctx) => { const action = (ctx.args[0] || 'help').toLowerCase(); if (action === 'add') { await add(ctx); return }; if (action === 'list') { await list(ctx); return }; if (action === 'remove') { await remove(ctx); return }; if (action === 'clear') { await clear(ctx); return }; await help(ctx) } },
]
