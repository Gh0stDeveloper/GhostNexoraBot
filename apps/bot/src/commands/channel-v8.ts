import type { BotCommand, CommandContext } from '../types.js'
import { effectiveCommands } from '../services/menu-registry.js'
import { config } from '../config.js'
import { fetchChannelMessages, postServerId, publishChannelText, reactChannelMessage, resolveOfficialChannel, shareChannelPostToGroup, updateChannel, channelMessageIdFromUrl } from '../services/channel-v8.js'

function requireChannelStaff(ctx: CommandContext) { if (!ctx.isBotStaff && !ctx.isOwner && !(ctx.instanceId && ctx.isSubbotOwner)) throw new Error('Necesitas permisos de staff/owner para administrar el canal.') }
function requireChannelOwner(ctx: CommandContext) { if (!ctx.isOwner && !ctx.isSubbotOwner) throw new Error('Solo el owner del bot o del subbot puede modificar el canal.') }

async function channelInfo(ctx: CommandContext) {
  const { metadata, jid } = await resolveOfficialChannel(ctx.socket)
  await ctx.reply([
    '📢 *CANAL OFICIAL DE WHATSAPP*',
    '━━━━━━━━━━━━━━',
    `Nombre: *${metadata.name ?? 'N/D'}*`,
    `JID: *${jid}*`,
    `Suscriptores: *${metadata.subscribers ?? 'N/D'}*`,
    `Verificado: *${metadata.verification ? 'Sí' : 'N/D'}*`,
    `URL: ${config.officialChannelUrl}`,
  ].join('\n'))
}

async function channelPost(ctx: CommandContext) {
  requireChannelStaff(ctx)
  const text = ctx.argText.trim()
  if (!text) throw new Error(`Uso: ${ctx.prefix}channelpost <mensaje>`)
  const { jid } = await resolveOfficialChannel(ctx.socket)
  await publishChannelText(ctx.socket, jid, text)
  await ctx.reply('✅ Publicación enviada al canal oficial.')
}

async function channelShare(ctx: CommandContext) {
  requireChannelStaff(ctx)
  const url = ctx.args[0]
  if (!url) throw new Error(`Uso: ${ctx.prefix}channelshare <https://whatsapp.com/channel/.../mensaje> [all]`)
  const serverId = channelMessageIdFromUrl(url)
  if (!serverId) throw new Error('El enlace debe apuntar a una publicación concreta del canal.')
  const { jid } = await resolveOfficialChannel(ctx.socket, url)
  const messages = await fetchChannelMessages(ctx.socket, jid, 50)
  const post = messages.find((item: any) => postServerId(item) === serverId)
  if (!post) throw new Error('No encontré esa publicación entre las últimas publicaciones recuperables del canal.')
  const targets = ctx.args[1]?.toLowerCase() === 'all' ? Object.keys(await ctx.socket.groupFetchAllParticipating()) : [ctx.chatId]
  let sent = 0
  for (const group of targets) {
    try { await shareChannelPostToGroup(ctx.socket, group, post, config.officialChannelUrl); sent += 1 } catch { /* per-group failure */ }
    await new Promise((resolve) => setTimeout(resolve, 350))
  }
  await ctx.reply(`📢 *PUBLICACIÓN COMPARTIDA*\n━━━━━━━━━━━━━━\nGrupos alcanzados: *${sent}/${targets.length}*`)
}

async function channelReact(ctx: CommandContext) {
  requireChannelStaff(ctx)
  const url = ctx.args[0]
  const emoji = ctx.args[1] || '👍'
  if (!url) throw new Error(`Uso: ${ctx.prefix}channelreact <url-del-mensaje> <emoji>`)
  const serverId = channelMessageIdFromUrl(url); if (!serverId) throw new Error('Enlace de canal inválido.')
  const { jid } = await resolveOfficialChannel(ctx.socket, url)
  await reactChannelMessage(ctx.socket, jid, serverId, emoji)
  await ctx.reply(`✅ Reacción *${emoji}* aplicada.`)
}

async function channelName(ctx: CommandContext) { requireChannelOwner(ctx); const value = ctx.argText.trim(); if (!value) throw new Error(`Uso: ${ctx.prefix}channelname <nombre>`); const { jid } = await resolveOfficialChannel(ctx.socket); await updateChannel(ctx.socket, jid, 'name', value); await ctx.reply('✅ Nombre del canal actualizado.') }
async function channelDescription(ctx: CommandContext) { requireChannelOwner(ctx); const value = ctx.argText.trim(); if (!value) throw new Error(`Uso: ${ctx.prefix}channeldescription <descripción>`); const { jid } = await resolveOfficialChannel(ctx.socket); await updateChannel(ctx.socket, jid, 'description', value); await ctx.reply('✅ Descripción del canal actualizada.') }

async function channelCatalog(ctx: CommandContext) {
  requireChannelStaff(ctx)
  const { jid } = await resolveOfficialChannel(ctx.socket)
  const catalog = effectiveCommands().map(({ command, tokens }) => ({ command: command.name, aliases: command.aliases ?? [], tokens, category: command.category, description: command.description, usage: command.usage ?? null, permissions: { ownerOnly: Boolean(command.ownerOnly), staffOnly: Boolean(command.staffOnly), adminOnly: Boolean(command.adminOnly), groupOnly: Boolean(command.groupOnly) } }))
  const payload = JSON.stringify({ bot: 'Ghost Nexora Bot', version: '0.0.7c', status: 'BETA · EN CONSTRUCCIÓN', generatedAt: new Date().toISOString(), officialChannelUrl: config.officialChannelUrl, commandCount: catalog.length, commands: catalog }, null, 2)
  await publishChannelText(ctx.socket, jid, `📚 *CATÁLOGO COMPLETO DE GHOST NEXORA BOT*\n\n${payload}`)
  await ctx.reply(`✅ Catálogo JSON enviado al canal. Comandos incluidos: *${catalog.length}*.`)
}

export const channelV8Commands: BotCommand[] = [
  { name: 'channelinfo', aliases: ['canalinfo'], category: 'tools', description: 'Consulta los metadatos del canal oficial de WhatsApp.', usage: 'channelinfo', handler: channelInfo },
  { name: 'channelpost', aliases: ['canalpost', 'canalmsg'], category: 'owner', staffOnly: true, description: 'Publica un mensaje en el canal oficial si el bot tiene permisos.', usage: 'channelpost <mensaje>', handler: channelPost },
  { name: 'channelshare', aliases: ['canalshare', 'sharechannel'], category: 'owner', staffOnly: true, description: 'Toma una publicación del canal y la comparte en el grupo actual o en todos los grupos.', usage: 'channelshare <url> [all]', handler: channelShare },
  { name: 'channelreact', aliases: ['canalreact'], category: 'owner', staffOnly: true, description: 'Reacciona a una publicación del canal.', usage: 'channelreact <url> <emoji>', handler: channelReact },
  { name: 'channelname', aliases: ['canalname'], category: 'owner', ownerOnly: true, description: 'Actualiza el nombre del canal.', usage: 'channelname <nombre>', handler: channelName },
  { name: 'channeldescription', aliases: ['canaldesc'], category: 'owner', ownerOnly: true, description: 'Actualiza la descripción del canal.', usage: 'channeldescription <texto>', handler: channelDescription },
  { name: 'channelcatalog', aliases: ['canalcatalog', 'botcatalogchannel'], category: 'owner', staffOnly: true, description: 'Genera y publica el catálogo JSON completo de comandos en el canal.', usage: 'channelcatalog', handler: channelCatalog },
]
