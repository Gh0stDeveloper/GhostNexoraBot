import type { BotCommand, CommandContext } from '../types.js'
import { effectiveCommands } from '../services/menu-registry.js'
import { config } from '../config.js'
import { fetchChannelMessages, postServerId, publishChannelText, reactChannelMessage, resolveOfficialChannel, shareChannelPostToGroup, updateChannel, channelMessageIdFromUrl } from '../services/channel-v8.js'
import fs from 'node:fs/promises'
import path from 'node:path'

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

function humanPermission(command: BotCommand) {
  const labels: string[] = []
  if (command.ownerOnly) labels.push('Owner')
  else if (command.staffOnly) labels.push('Staff')
  if (command.adminOnly) labels.push('Admin')
  if (command.groupOnly) labels.push('Grupo')
  return labels.length ? labels.join(' · ') : 'Todos'
}

async function readCatalogManifest() {
  const candidates = [
    path.resolve(process.cwd(), 'docs/bot-functions-v8.json'),
    path.resolve(process.cwd(), '../../docs/bot-functions-v8.json'),
    path.resolve(process.cwd(), 'bot-functions-v8.json'),
  ]
  for (const file of candidates) {
    try {
      const raw = await fs.readFile(file, 'utf8')
      return JSON.parse(raw) as { bot?: string; version?: string; status?: string; description?: string; author?: string; features?: Record<string, unknown>; notes?: string[] }
    } catch { /* try next path */ }
  }
  return null
}

function formatFeatureList(features: Record<string, unknown> | undefined) {
  if (!features) return []
  const titleMap: Record<string, string> = {
    apk: '📦 *APK Y DESCARGAS*',
    pvz2: '🌱 *PLANTAS VS ZOMBIES 2*',
    channel: '📢 *CANAL DE WHATSAPP*',
    developer: '🛠️ *DEVELOPER*',
    humanInteraction: '💬 *INTERACCIÓN NATURAL*',
    ai: '🧠 *INTELIGENCIA ARTIFICIAL*',
  }
  return Object.entries(features).map(([key, value]) => {
    const title = titleMap[key] ?? `🔹 *${key.toUpperCase()}*`
    const values = Array.isArray(value) ? value.map(String) : [String(value)]
    return `${title}\n${values.map((item) => `│ ${item}`).join('\n')}`
  })
}

async function channelCatalog(ctx: CommandContext) {
  requireChannelStaff(ctx)
  const { jid } = await resolveOfficialChannel(ctx.socket)
  const manifest = await readCatalogManifest()
  const catalog = effectiveCommands().map(({ command, tokens }) => ({ command: command.name, aliases: command.aliases ?? [], tokens, category: command.category, description: command.description, usage: command.usage ?? null, permissions: humanPermission(command) }))
  const grouped = new Map<string, typeof catalog>()
  for (const item of catalog) {
    const list = grouped.get(item.category) ?? []
    list.push(item)
    grouped.set(item.category, list)
  }
  const sections: string[] = []
  if (manifest) {
    sections.push([
      `╭━━〔 👻 *${manifest.bot ?? 'GHOST NEXORA BOT'}* 〕━━╮`,
      `┃ Versión » *${manifest.version ?? '0.0.7c'}*`,
      `┃ Estado » *${manifest.status ?? 'BETA · EN CONSTRUCCIÓN'}*`,
      '╰━━━━━━━━━━━━━━━━━━━━╯',
      manifest.description ? `\n${manifest.description}` : '',
      ...formatFeatureList(manifest.features),
    ].filter(Boolean).join('\n\n'))
  } else {
    sections.push('╭━━〔 👻 *GHOST NEXORA BOT* 〕━━╮\n┃ *CATÁLOGO DE FUNCIONES*\n╰━━━━━━━━━━━━━━━━━━━━╯')
  }
  for (const [category, items] of grouped) {
    const rows = items.map((item) => {
      const aliasText = item.aliases.length ? ` · aliases: ${item.aliases.slice(0, 4).join(', ')}` : ''
      const usage = item.usage ? `\n│ Uso: *${ctx.prefix}${item.usage}*` : ''
      return `│ *${ctx.prefix}${item.command}*${aliasText}\n│ ${item.description}${usage}\n│ Acceso: *${item.permissions}*`
    }).join('\n\n')
    sections.push(`╭─〔 📂 *${category.toUpperCase()}* 〕\n${rows}\n╰────────────────────`)
  }
  sections.push(`📊 *Total:* ${catalog.length} comandos\n📢 Canal oficial: ${config.officialChannelUrl}\n\n👻 *Ghost Nexora Bot · ${manifest?.version ?? '0.0.7c'} · BETA · EN CONSTRUCCIÓN*`)
  const message = sections.join('\n\n')
  await publishChannelText(ctx.socket, jid, message)
  await ctx.reply(`✅ Catálogo publicado como mensaje normal. Comandos incluidos: *${catalog.length}*.`)
}

export const channelV8Commands: BotCommand[] = [
  { name: 'channelinfo', aliases: ['canalinfo'], category: 'tools', description: 'Consulta los metadatos del canal oficial de WhatsApp.', usage: 'channelinfo', handler: channelInfo },
  { name: 'channelpost', aliases: ['canalpost', 'canalmsg'], category: 'owner', staffOnly: true, description: 'Publica un mensaje en el canal oficial si el bot tiene permisos.', usage: 'channelpost <mensaje>', handler: channelPost },
  { name: 'channelshare', aliases: ['canalshare', 'sharechannel'], category: 'owner', staffOnly: true, description: 'Toma una publicación del canal y la comparte en el grupo actual o en todos los grupos.', usage: 'channelshare <url> [all]', handler: channelShare },
  { name: 'channelreact', aliases: ['canalreact'], category: 'owner', staffOnly: true, description: 'Reacciona a una publicación del canal.', usage: 'channelreact <url> <emoji>', handler: channelReact },
  { name: 'channelname', aliases: ['canalname'], category: 'owner', ownerOnly: true, description: 'Actualiza el nombre del canal.', usage: 'channelname <nombre>', handler: channelName },
  { name: 'channeldescription', aliases: ['canaldesc'], category: 'owner', ownerOnly: true, description: 'Actualiza la descripción del canal.', usage: 'channeldescription <texto>', handler: channelDescription },
  { name: 'channelcatalog', aliases: ['canalcatalog', 'botcatalogchannel'], category: 'owner', staffOnly: true, description: 'Publica el catálogo del bot como mensaje normal, usando la información del manifiesto JSON.', usage: 'channelcatalog', handler: channelCatalog },
]
