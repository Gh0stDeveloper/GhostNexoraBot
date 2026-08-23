import QRCode from 'qrcode'
import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { economy, COIN_SYMBOL } from '../services/economy.js'
import { advancedEconomy } from '../services/economy-advanced.js'
import { economyV2 } from '../services/economy-v2.js'
import { mining, MINER_MAX_COUNT } from '../services/mining.js'
import { professionsV2, V2_PROFESSIONS } from '../services/professions-v2.js'
import { groupEconomyTop, rememberGroupMembers } from '../services/identity.js'
import { isGroupAdministrator, resolveTarget } from '../utils/target.js'
import { downloadMessageMedia } from '../utils/message.js'
import { subbotManager } from '../core/subbots.js'
import { globalStickers } from '../services/human-stickers.js'
import { createDownloadProgress } from '../services/progress.js'
import { downloadLempi } from '../services/lempi.js'
import { downloadSocialVideo, getMediaInfo, searchYouTube } from '../services/downloader.js'
import { downloadAdult, searchAdult, type AdultProvider } from '../services/adult.js'
import { searchGelbooru } from '../services/booru.js'
import { getReactionGif, reactionGifToMp4, type ReactionCategory } from '../services/reactions.js'
import { createV2WaifuRoll, jikanCharacter, jikanSearchCharacters } from '../services/jikan-v2.js'
import { getClaim, giveWaifu, listHarem, rarityEmoji } from '../services/waifu.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} ${COIN_SYMBOL}`
const waitText = (ms: number) => `${Math.max(1, Math.ceil(ms / 1000))} s`
const permanentMs = 100 * 365 * 86400_000

function amount(value?: string) {
  const parsed = Number((value ?? '').replace(/[,_]/g, ''))
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Indica una cantidad válida.')
  return Math.floor(parsed)
}

function bytes(value: number) { return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 / 1024).toFixed(1)} MB` }
function isUrl(value: string) { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) } catch { return false } }

async function requireAdminMenu(ctx: CommandContext) {
  if (!await isGroupAdministrator(ctx)) throw new Error('Este menú está disponible únicamente para administradores del grupo o staff del bot.')
}

const menus: Record<string, (ctx: CommandContext) => Promise<string> | string> = {
  downloads: (ctx) => [
    '╭━━〔 ⬇️ *DESCARGAS* 〕━━╮',
    `┃ ${ctx.prefix}yts <texto> — Busca videos en YouTube.`,
    `┃ ${ctx.prefix}ytmp3 <url> — Descarga audio por enlace.`,
    `┃ ${ctx.prefix}ytmp4 <url> [calidad] — Descarga video por enlace.`,
    `┃ ${ctx.prefix}facebook <url> — Descarga Facebook; Lempi actúa como respaldo.`,
    `┃ ${ctx.prefix}instagram <url> — Descarga contenido público.`,
    `┃ ${ctx.prefix}tiktok <url|búsqueda> — TikTok público.`,
    `┃ ${ctx.prefix}twitter <url> — Descarga video de X/Twitter.`,
    `┃ ${ctx.prefix}mediafire <url> — Descarga archivos de MediaFire.`,
    `┃ ${ctx.prefix}soundcloud <url|búsqueda> — Audio de SoundCloud.`,
    '╰━━━━━━━━━━━━━━━━╯',
  ].join('\n'),
  economy: (ctx) => [
    '╭━━〔 🪙 *NEXORA ECONOMY* 〕━━╮',
    `┃ ${ctx.prefix}balance — Billetera global, banco y patrimonio.`,
    `┃ ${ctx.prefix}work — Trabaja; cooldown de 1 minuto.`,
    `┃ ${ctx.prefix}job — Elige entre 20 profesiones.`,
    `┃ ${ctx.prefix}transfer @user <NXC> — Transfiere a la billetera global.`,
    `┃ ${ctx.prefix}deposit / ${ctx.prefix}withdraw — Banco.`,
    `┃ ${ctx.prefix}loan <NXC> — Préstamo bancario.`,
    `┃ ${ctx.prefix}loan pay [NXC|all] — Paga el préstamo.`,
    `┃ ${ctx.prefix}lend @user <NXC> [interés] — Préstamo entre usuarios.`,
    `┃ ${ctx.prefix}miner — Minería pasiva NXC.`,
    `┃ ${ctx.prefix}top — Ranking del grupo actual.`,
    `┃ ${ctx.prefix}topglobal — Ranking global.`,
    `┃ ${ctx.prefix}shop — Tienda de accesos, subbots y mineros.`,
    '╰━━━━━━━━━━━━━━━━╯',
  ].join('\n'),
  social: (ctx) => [
    '╭━━〔 💞 *SOCIAL Y REACCIONES* 〕━━╮',
    `┃ ${ctx.prefix}hug / kiss / pat — Reacciones anime.`,
    `┃ ${ctx.prefix}smoke — Reacción de fumar.`,
    `┃ ${ctx.prefix}drug — Reacción ficticia/caótica.`,
    `┃ ${ctx.prefix}slime — Reacción slime.`,
    `┃ Puedes mencionar o responder al usuario en comandos dirigidos.`,
    '╰━━━━━━━━━━━━━━━━╯',
  ].join('\n'),
  adult: (ctx) => [
    '╭━━〔 🔞 *MÓDULO 18+* 〕━━╮',
    `┃ ${ctx.prefix}adult18 accept — Confirma mayoría de edad.`,
    `┃ ${ctx.prefix}xvideos <búsqueda|url> — Busca o descarga.`,
    `┃ ${ctx.prefix}xnxx <búsqueda|url> — Busca o descarga.`,
    `┃ ${ctx.prefix}pornhub <búsqueda|url> — Busca o descarga.`,
    `┃ ${ctx.prefix}erome — Navegación y descarga Erome.`,
    `┃ ${ctx.prefix}fuck / cum / preñar — Roleplay 18+ con consentimiento mutuo.`,
    '╰━━━━━━━━━━━━━━━━╯',
  ].join('\n'),
  admin: async (ctx) => {
    await requireAdminMenu(ctx)
    const staff = ctx.isBotStaff || ctx.isOwner
    return [
      '╭━━〔 🛡️ *ADMINISTRACIÓN* 〕━━╮',
      `┃ ${ctx.prefix}rules — Reglas/estado de moderación.`,
      `┃ ${ctx.prefix}kick / promote / demote — Moderación por mención o respuesta.`,
      `┃ ${ctx.prefix}antilink on|off — Anti-link con 3 advertencias.`,
      `┃ ${ctx.prefix}antispam on|off — Anti-spam con 3 advertencias.`,
      `┃ ${ctx.prefix}welcome on|off — Bienvenida del grupo.`,
      `┃ ${ctx.prefix}adultmode on|off — NSFW por grupo.`,
      staff ? `┃ ${ctx.prefix}addnxc @user <NXC> — Regala saldo.` : '',
      staff ? `┃ ${ctx.prefix}subbotgrant @user <7d|30d|permanent> — Regala subbot.` : '',
      staff ? `┃ ${ctx.prefix}subbotreset @user|#id — Borra una sesión subbot.` : '',
      staff ? `┃ ${ctx.prefix}botsticker — Biblioteca global de stickers.` : '',
      staff ? `┃ ${ctx.prefix}kicksticker set — Define sticker de expulsión.` : '',
      staff ? `┃ ${ctx.prefix}broadcast <mensaje> — Anuncio a todos los grupos.` : '',
      '╰━━━━━━━━━━━━━━━━╯',
    ].filter(Boolean).join('\n')
  },
}

async function menuCommand(ctx: CommandContext) {
  const section = (ctx.args[0] ?? '').toLowerCase()
  if (section && menus[section]) { await ctx.reply(await menus[section](ctx)); return }
  await ctx.reply([
    '╭━━━━━━━━━━━━━━━━━━━━╮',
    '┃ 👻 *GHOST NEXORA BOT · V2*',
    `┃ 👤 ${ctx.pushName}`,
    `┃ ⌨️ Prefijo: *${ctx.prefix}*`,
    '╰━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '🧠 *IA Y BÚSQUEDA*',
    `• ${ctx.prefix}ai — Asistente IA.`, `• ${ctx.prefix}google — Búsqueda web.`, `• ${ctx.prefix}wiki — Wikipedia.`,
    '', '⬇️ *DESCARGAS*', `• ${ctx.prefix}menu downloads — YouTube, redes y archivos.`,
    '', '🪙 *ECONOMÍA*', `• ${ctx.prefix}menu economy — Billetera global, banco, minería y tops.`,
    '', '🎮 *JUEGOS Y COLECCIÓN*', `• ${ctx.prefix}flip / dados / bj / ttt — Juegos NXC.`, `• ${ctx.prefix}rw / claim / harem — Colección Jikan/MAL.`,
    '', '💞 *SOCIAL*', `• ${ctx.prefix}menu social — Reacciones y comandos sociales.`,
    '', '🔞 *18+*', `• ${ctx.prefix}menu adult — Solo mayores de edad y grupos autorizados.`,
    '', '🤖 *SUBBOT*', `• ${ctx.prefix}subbot status — Estado real de tu instancia.`,
    '', '🛡️ *ADMIN*', `• ${ctx.prefix}menu admin — Solo administradores.`,
    '', `📢 Canal oficial: ${config.officialChannelUrl}`,
  ].join('\n'))
}

async function jobCommand(ctx: CommandContext) {
  const requested = ctx.argText.trim()
  if (requested && !['list', 'lista', 'menu'].includes(requested.toLowerCase())) {
    const selected = professionsV2.set(ctx.sender, requested)
    await ctx.reply(`💼 *PROFESIÓN ACTUALIZADA*\n━━━━━━━━━━━━━━\n${selected.emoji} *${selected.label}*\n${selected.description}\n💰 ${fmt(selected.min)} — ${fmt(selected.max)} por trabajo\n⏱️ Cooldown: *1 minuto*`)
    return
  }
  const current = professionsV2.get(ctx.sender)
  const lines = Object.entries(V2_PROFESSIONS).map(([id, item], index) => `${index + 1}. ${item.emoji} *${item.label}* — ${item.description}\n   Elegir: *${ctx.prefix}job ${id}*`)
  await ctx.reply(`💼 *PROFESIONES NEXORA*\nActual: ${current.emoji} *${current.label}*\n\n${lines.join('\n\n')}`)
}

async function workCommand(ctx: CommandContext) {
  if (ctx.args[0]) professionsV2.set(ctx.sender, ctx.args[0]!)
  const result = professionsV2.work(ctx.sender)
  if (!result.ok) throw new Error(`Vuelve a trabajar en ${waitText(result.remaining)}.`)
  await ctx.reply(`💼 *TRABAJO COMPLETADO*\n━━━━━━━━━━━━━━\n${result.profession.emoji} ${result.profession.label}\n💰 Ganancia: *${fmt(result.reward)}*\n👛 Cartera global: *${fmt(result.balance.wallet)}*\n⏱️ Próximo trabajo: 1 minuto`)
}

async function balanceCommand(ctx: CommandContext) {
  const b = economy.balance(ctx.sender)
  const extra = advancedEconomy.summary(ctx.sender)
  const miner = mining.summary(ctx.sender)
  const profession = professionsV2.get(ctx.sender)
  const gross = b.total + extra.investments + extra.cda
  await ctx.reply([
    '╭━━〔 🪙 *BILLETERA GLOBAL NXC* 〕━━╮',
    `┃ 👛 Cartera: *${fmt(b.wallet)}*`, `┃ 🏦 Banco: *${fmt(b.bank)}*`,
    `┃ 📈 Inversiones: *${fmt(extra.investments)}*`, `┃ 🔒 Plazo fijo: *${fmt(extra.cda)}*`, `┃ 💳 Deuda: *${fmt(extra.debt)}*`,
    `┃ ⛏️ Mineros: *${miner.count}/${MINER_MAX_COUNT}* · pendiente ${fmt(miner.pending)}`,
    `┃ ${profession.emoji} Profesión: *${profession.label}*`,
    '┣━━━━━━━━━━━━━━━━', `┃ 💎 Patrimonio neto: *${fmt(gross - extra.debt)}*`,
    '╰━━━━━━━━━━━━━━━━╯', '', 'Esta billetera es la misma en grupos, privado y subbots.',
  ].join('\n'))
}

async function transferCommand(ctx: CommandContext) {
  const target = await resolveTarget(ctx, { requiredMessage: 'Menciona, responde o indica el número del usuario que recibirá los NXC.' })
  const value = amount(ctx.args.find((arg) => /^\d[\d,_]*$/.test(arg)))
  const result = economyV2.transfer(ctx.sender, target!, value)
  const received = economy.balance(target!)
  await ctx.socket.sendMessage(ctx.chatId, {
    text: `💸 *TRANSFERENCIA GLOBAL COMPLETADA*\n━━━━━━━━━━━━━━\n📤 Enviaste: *${fmt(value)}*\n📥 @${target!.split('@')[0]} recibió el saldo en su billetera global.\n👛 Tu cartera: *${fmt(result.wallet)}*\n👛 Cartera destino: *${fmt(received.wallet)}*`,
    mentions: [target!],
  }, { quoted: ctx.message })
}

async function topCommand(ctx: CommandContext, global = false) {
  let rows
  let title
  if (global || !ctx.isGroup) {
    rows = economyV2.globalTop(10); title = '🌍 TOP GLOBAL · NEXORA ECONOMY'
  } else {
    const metadata = await ctx.socket.groupMetadata(ctx.chatId)
    rememberGroupMembers(ctx.chatId, metadata.participants)
    rows = groupEconomyTop(ctx.chatId, 10); title = `🏆 TOP DEL GRUPO · ${metadata.subject}`
  }
  if (!rows.length) throw new Error('Todavía no hay datos suficientes para este ranking.')
  const mentions = rows.map((row) => row.userJid)
  await ctx.socket.sendMessage(ctx.chatId, {
    text: `*${title}*\n━━━━━━━━━━━━━━\n${rows.map((row, i) => `${i + 1}. @${row.userJid.split('@')[0]} — *${fmt(row.total)}*`).join('\n')}`,
    mentions,
  }, { quoted: ctx.message })
}

async function loanCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'status').toLowerCase()
  if (['pay', 'pagar', 'payment'].includes(action)) {
    const raw = ctx.args[1]?.toLowerCase()
    const requested = !raw || ['all', 'todo'].includes(raw) ? undefined : amount(raw)
    const result = advancedEconomy.payDebt(ctx.sender, requested)
    await ctx.reply(`💳 *PAGO DE PRÉSTAMO*\n━━━━━━━━━━━━━━\nDestino: ${result.type === 'bank' ? '*Banco Nexora*' : '*Usuario prestamista*'}\nPagado: *${fmt(result.amount)}*\nPendiente: *${fmt(result.remaining)}*\nCartera: *${fmt(result.balance.wallet)}*`)
    return
  }
  if (action === 'status') {
    const debts = advancedEconomy.debts(ctx.sender)
    const peer = debts.peers.reduce((sum, item) => sum + item.balanceDue, 0)
    await ctx.reply(`🏦 *CENTRO DE PRÉSTAMOS*\n━━━━━━━━━━━━━━\nBanco: *${fmt(debts.bank?.balanceDue ?? 0)}*\nUsuarios: *${fmt(peer)}*\n\nPagar: *${ctx.prefix}loan pay all*`)
    return
  }
  const result = advancedEconomy.requestBankLoan(ctx.sender, amount(ctx.args[0]))
  await ctx.reply(`🏦 *PRÉSTAMO APROBADO*\nRecibiste *${fmt(result.amount)}* y debes devolver *${fmt(result.due)}*.\nPaga con *${ctx.prefix}loan pay [monto|all]*.`)
}

async function lendCommand(ctx: CommandContext) {
  const target = await resolveTarget(ctx, { requiredMessage: 'Menciona o responde al usuario que recibirá el préstamo.' })
  const numbers = ctx.args.filter((arg) => /^\d+(?:\.\d+)?%?$/.test(arg))
  const value = amount(numbers[0]?.replace('%', ''))
  const interest = Number(numbers[1]?.replace('%', '') ?? 5)
  const result = advancedEconomy.lend(ctx.sender, target!, value, interest)
  await ctx.socket.sendMessage(ctx.chatId, { text: `🤝 *PRÉSTAMO #${result.id}*\n@${target!.split('@')[0]} recibió *${fmt(result.amount)}*.\nInterés: ${result.rate}% · Debe: *${fmt(result.due)}*\nPago: *${ctx.prefix}loan pay*`, mentions: [target!] }, { quoted: ctx.message })
}

async function robCommand(ctx: CommandContext) {
  const target = await resolveTarget(ctx, { requiredMessage: 'Menciona o responde a la persona que intentas robar.' })
  const result = economyV2.rob(ctx.sender, target!)
  if (!result.ok) throw new Error(`Podrás volver a intentarlo en ${waitText(result.remaining)}.`)
  if (result.reason === 'empty') await ctx.reply('🕵️ Esa persona no lleva suficiente NXC en la cartera. El banco está protegido.')
  else if (result.success) await ctx.socket.sendMessage(ctx.chatId, { text: `🦹 *ROBO EXITOSO*\nConseguiste *${fmt(result.amount)}* de @${target!.split('@')[0]}.`, mentions: [target!] }, { quoted: ctx.message })
  else await ctx.reply(`🚓 *TE ATRAPARON*\nPerdiste *${fmt(result.amount)}*.`)
}

async function minerCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'status').toLowerCase()
  if (['buy', 'comprar'].includes(action)) {
    const result = mining.buy(ctx.sender)
    await ctx.reply(`⛏️ *MINERO NXC COMPRADO*\n━━━━━━━━━━━━━━\nPrecio: *${fmt(result.price)}*\nMineros: *${result.count}/${MINER_MAX_COUNT}*\nProducción: *${fmt(result.hourly)}/h*\nAcumulación offline: máximo ${result.capHours} h.`)
    return
  }
  if (['collect', 'cobrar', 'reclamar'].includes(action)) {
    const result = mining.collect(ctx.sender)
    await ctx.reply(`⛏️ *MINERÍA RECLAMADA*\nRecibiste: *${fmt(result.amount)}*\nCartera: *${fmt(result.balance.wallet)}*`)
    return
  }
  const state = mining.summary(ctx.sender)
  await ctx.reply(`⛏️ *MINERÍA NXC*\n━━━━━━━━━━━━━━\nMineros: *${state.count}/${MINER_MAX_COUNT}*\nProducción: *${fmt(state.hourly)}/h*\nPendiente: *${fmt(state.pending)}*\nTotal minado: *${fmt(state.totalMined)}*\n${state.nextPrice ? `Siguiente minero: *${fmt(state.nextPrice)}*\nComprar: *${ctx.prefix}miner buy*` : 'Ya tienes el máximo de mineros.'}\nCobrar: *${ctx.prefix}miner collect*`)
}

const products = {
  private1d: { price: 2000, kind: 'private_access', duration: 86400_000, label: 'Acceso privado · 1 día' },
  private7d: { price: 10000, kind: 'private_access', duration: 7 * 86400_000, label: 'Acceso privado · 7 días' },
  private30d: { price: 30000, kind: 'private_access', duration: 30 * 86400_000, label: 'Acceso privado · 30 días' },
  subbot1d: { price: 6000, kind: 'subbot_slot', duration: 86400_000, label: 'Subbot · 1 día' },
  subbot7d: { price: 30000, kind: 'subbot_slot', duration: 7 * 86400_000, label: 'Subbot · 7 días' },
  subbot30d: { price: 100000, kind: 'subbot_slot', duration: 30 * 86400_000, label: 'Subbot · 30 días' },
} as const

async function shopCommand(ctx: CommandContext) {
  const b = economy.balance(ctx.sender)
  const miner = mining.summary(ctx.sender)
  await ctx.reply([
    '╭━━〔 🛒 *NEXORA STORE* 〕━━╮', `┃ Saldo global: *${fmt(b.total)}*`, '╰━━━━━━━━━━━━━━━━╯', '',
    `🔐 *private1d* — ${fmt(products.private1d.price)} · acceso privado 24 h`,
    `🔐 *private7d* — ${fmt(products.private7d.price)} · acceso privado 7 días`,
    `💎 *private30d* — ${fmt(products.private30d.price)} · acceso privado 30 días`,
    `🤖 *subbot1d* — ${fmt(products.subbot1d.price)} · subbot 24 h`,
    `🤖 *subbot7d* — ${fmt(products.subbot7d.price)} · subbot 7 días`,
    `👑 *subbot30d* — ${fmt(products.subbot30d.price)} · subbot 30 días`,
    `⛏️ *miner* — ${miner.nextPrice ? fmt(miner.nextPrice) : 'MÁXIMO'} · ${fmt(25)}/h por minero, máximo ${MINER_MAX_COUNT}`,
    '', `Comprar: *${ctx.prefix}buy <producto>*`,
  ].join('\n'))
}

async function buyCommand(ctx: CommandContext) {
  const id = (ctx.args[0] ?? '').toLowerCase()
  if (id === 'miner') { const result = mining.buy(ctx.sender); await ctx.reply(`✅ Compraste un minero por *${fmt(result.price)}*. Producción total: *${fmt(result.hourly)}/h*.`); return }
  const item = products[id as keyof typeof products]
  if (!item) throw new Error(`Producto inválido. Consulta ${ctx.prefix}shop.`)
  const result = economy.purchase(ctx.sender, item.price, item.kind, item.duration, { product: id, v: 2 })
  if (item.kind === 'subbot_slot') {
    const active = economy.getActiveSubbot(ctx.sender)
    if (active) economy.db.prepare('UPDATE subbots SET expires_at = ? WHERE id = ?').run(result.expiresAt, active.id)
    else economy.createSubbot(ctx.sender, result.expiresAt)
  }
  await ctx.reply(`✅ *COMPRA COMPLETADA*\n${item.label}\nPrecio: *${fmt(item.price)}*\nVence: ${new Date(result.expiresAt).toLocaleString('es-MX')}`)
}

async function sendYoutube(ctx: CommandContext, kind: 'audio' | 'video', url: string, quality?: number) {
  if (!isUrl(url)) throw new Error(`Este comando solo acepta enlaces de YouTube. Para buscar usa ${ctx.prefix}yts <texto>.`)
  const progress = await createDownloadProgress(ctx, kind === 'audio' ? 'YouTube · audio' : `YouTube · video${quality ? ` ${quality}p` : ''}`)
  await progress.update('downloading', 'Proveedor: API Lempi')
  const result = await downloadLempi(url, kind, quality)
  try {
    await progress.update('sending', `${bytes(result.size)} · enviando a WhatsApp`)
    if (kind === 'audio') await ctx.socket.sendMessage(ctx.chatId, { audio: { url: result.filePath }, mimetype: 'audio/mpeg', ptt: false }, { quoted: ctx.message })
    else await ctx.socket.sendMessage(ctx.chatId, { video: { url: result.filePath }, mimetype: 'video/mp4', caption: `🎬 YouTube · ${bytes(result.size)}` }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
    await progress.update('done', `${bytes(result.size)} enviados.`)
  } finally { await result.cleanup() }
}

async function ytsCommand(ctx: CommandContext) {
  const query = ctx.argText.trim()
  if (!query) throw new Error(`Uso: ${ctx.prefix}yts <búsqueda>`)
  const rows = await searchYouTube(query, 8)
  if (!rows.length) throw new Error('No encontré resultados en YouTube.')
  const text = rows.map((item, i) => [
    `${i + 1}. ▶️ *${item.title}*`, item.channel ? `   👤 ${item.channel}` : '',
    `   🎧 ${ctx.prefix}ytmp3 ${item.url}`, `   🎬 ${ctx.prefix}ytmp4 ${item.url} 720`,
  ].filter(Boolean).join('\n')).join('\n\n')
  await ctx.reply(`🔎 *YOUTUBE · RESULTADOS*\nBúsqueda: *${query}*\n\n${text}`)
}

async function facebookCommand(ctx: CommandContext) {
  const url = ctx.args[0] ?? ''
  if (!isUrl(url)) throw new Error(`Uso: ${ctx.prefix}facebook <url>`)
  const progress = await createDownloadProgress(ctx, 'Facebook · video')
  const info = await getMediaInfo(url, 'facebook').catch(() => undefined)
  let result: Awaited<ReturnType<typeof downloadSocialVideo>> | Awaited<ReturnType<typeof downloadLempi>> | null = null
  try {
    if (info?.duration && info.duration >= 3600) {
      await progress.update('downloading', 'Video largo detectado · usando API Lempi')
      result = await downloadLempi(url, 'facebook')
    } else {
      await progress.update('downloading', 'Intentando descargador principal')
      try { result = await downloadSocialVideo(url, 'facebook') }
      catch {
        await progress.update('downloading', 'Respaldo API Lempi')
        result = await downloadLempi(url, 'facebook')
      }
    }
    await progress.update('sending', `${bytes(result.size)} · enviando a WhatsApp`)
    await ctx.socket.sendMessage(ctx.chatId, { video: { url: result.filePath }, mimetype: 'video/mp4', caption: `📘 Facebook · ${bytes(result.size)}` }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
    await progress.update('done')
  } finally { await result?.cleanup() }
}

async function adultSearchOrDownload(ctx: CommandContext, provider: AdultProvider) {
  const input = ctx.argText.trim()
  if (!input) throw new Error(`Uso: ${ctx.prefix}${provider} <búsqueda|url>`)
  if (isUrl(input)) { await adultDownload(ctx, provider, input); return }
  const rows = await searchAdult(provider, input, 10)
  if (!rows.length) throw new Error('No encontré resultados públicos.')
  const body = rows.map((item, i) => `${i + 1}. 🔞 *${item.title}*\n   Descargar: *${ctx.prefix}adultdl ${item.url.replace(/\s/g, '%20')}*`).join('\n\n')
  await ctx.reply(`🔞 *${provider.toUpperCase()} · RESULTADOS*\n━━━━━━━━━━━━━━\n${body}`)
}

async function adultDownload(ctx: CommandContext, provider: string, url: string) {
  const progress = await createDownloadProgress(ctx, `${provider.toUpperCase()} · video`)
  await progress.update('downloading', 'Extrayendo fuente directa del sitio')
  const result = await downloadAdult(url)
  try {
    await progress.update('sending', `${bytes(result.size)} · enviando a WhatsApp`)
    const sent = await ctx.socket.sendMessage(ctx.chatId, { video: { url: result.filePath }, mimetype: 'video/mp4', caption: `🔞 ${provider.toUpperCase()} · ${bytes(result.size)}` }, { quoted: ctx.message }).catch(() => null)
    if (!sent) await ctx.socket.sendMessage(ctx.chatId, { document: { url: result.filePath }, mimetype: 'video/mp4', fileName: result.fileName }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size); await progress.update('done')
  } finally { await result.cleanup() }
}

async function subbotCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'status').toLowerCase()
  const record = economy.getActiveSubbot(ctx.sender)
  if (!record) throw new Error(`No tienes una suscripción de subbot vigente. Consulta ${ctx.prefix}shop.`)
  if (action === 'status') {
    const labels: Record<string, string> = { pending: '⚪ Sin vincular', pairing: '🟡 Esperando vinculación', online: '🟢 Online', offline: '🟠 Vinculado · offline', logged_out: '🔴 Sesión cerrada', revoked: '🔴 Revocado' }
    await ctx.reply(`🤖 *MI SUBBOT #${record.id}*\n━━━━━━━━━━━━━━\n📱 Número: ${record.phone ?? 'sin vincular'}\n🔗 Vinculación: *${labels[record.status] ?? record.status}*\n💳 Suscripción: *ACTIVA* hasta ${new Date(record.expiresAt).toLocaleString('es-MX')}\n\n${record.status === 'online' ? 'La sesión está conectada correctamente.' : `Vincular: *${ctx.prefix}subbot pair <número>*\nQR: *${ctx.prefix}subbot qr*\nBorrar sesión fallida: *${ctx.prefix}subbot reset*`}`)
    return
  }
  if (['reset', 'delete', 'borrar', 'unlink'].includes(action)) {
    await subbotManager.reset(ctx.sender)
    await ctx.reply(`🧹 *SESIÓN SUBBOT BORRADA*\nLa suscripción sigue vigente, pero credenciales, QR, token de portal y número vinculado fueron eliminados.\nPuedes vincular de nuevo con *${ctx.prefix}subbot pair <número>*.`)
    return
  }
  if (action === 'pair') {
    const phone = ctx.args[1] ?? ''
    if (!phone) throw new Error(`Uso: ${ctx.prefix}subbot pair 52XXXXXXXXXX`)
    const result = await subbotManager.pair(ctx.sender, phone)
    if (result.alreadyLinked) { await ctx.reply('ℹ️ Ya existen credenciales vinculadas. El estado cambiará a online únicamente cuando WhatsApp abra la conexión.'); return }
    if (result.qr) { const image = await QRCode.toBuffer(result.qr, { width: 720, margin: 2 }); await ctx.socket.sendMessage(ctx.chatId, { image, caption: `📲 *QR SUBBOT #${record.id}*\nEscanéalo desde Dispositivos vinculados. Si falla, usa *${ctx.prefix}subbot reset* antes de reintentar.` }, { quoted: ctx.message }); return }
    const pretty = result.code?.match(/.{1,4}/g)?.join('-') ?? result.code
    await ctx.reply(`🔗 *CÓDIGO SUBBOT #${record.id}*\n\n*${pretty}*\n\nEl estado no se marcará online hasta que WhatsApp confirme la conexión.`)
    return
  }
  if (action === 'qr') {
    const result = await subbotManager.qr(ctx.sender)
    if (result.alreadyLinked) { await ctx.reply('ℹ️ La sesión ya tiene credenciales. Usa .subbot reset si deseas borrar y vincular de nuevo.'); return }
    if (!result.qr) throw new Error('WhatsApp no devolvió QR.')
    const image = await QRCode.toBuffer(result.qr, { width: 720, margin: 2 })
    await ctx.socket.sendMessage(ctx.chatId, { image, caption: `📲 *QR SUBBOT #${record.id}*\nTemporal · escanea desde Dispositivos vinculados.` }, { quoted: ctx.message })
    return
  }
  if (action === 'portal') {
    const token = economy.createPortalToken(ctx.sender, record.id)
    await ctx.reply(`🌐 *PORTAL SUBBOT*\n${config.publicWebUrl.replace(/\/$/, '')}/login?mode=subbot\n\nToken: *${token.token}*\nVence: ${new Date(token.expiresAt).toLocaleString('es-MX')}`)
    return
  }
  throw new Error('Usa subbot status, pair, qr, reset o portal.')
}

async function addNxc(ctx: CommandContext) {
  const target = await resolveTarget(ctx, { requiredMessage: 'Menciona o responde al usuario que recibirá NXC.' })
  const value = amount(ctx.args.find((arg) => /^\d[\d,_]*$/.test(arg)))
  const b = economyV2.credit(target!, value, 'admin_nxc_grant')
  await ctx.socket.sendMessage(ctx.chatId, { text: `🪙 *NXC AÑADIDOS*\n@${target!.split('@')[0]} recibió *${fmt(value)}*.\nNueva cartera: *${fmt(b.wallet)}*`, mentions: [target!] }, { quoted: ctx.message })
}

function grantDuration(raw: string) {
  const value = raw.toLowerCase()
  if (['permanent', 'permanente', 'forever'].includes(value)) return { duration: permanentMs, label: 'permanente' }
  const match = /^(\d+)([dh])$/.exec(value)
  if (!match) throw new Error('Duración inválida. Ejemplos: 1d, 7d, 30d, permanent.')
  const n = Number(match[1]); return { duration: n * (match[2] === 'h' ? 3600_000 : 86400_000), label: value }
}

async function subbotGrant(ctx: CommandContext) {
  const target = await resolveTarget(ctx, { requiredMessage: 'Menciona o responde al usuario que recibirá el subbot.' })
  const rawDuration = ctx.args.find((arg) => /^(?:\d+[dh]|permanent|permanente|forever)$/i.test(arg)) ?? '7d'
  const parsed = grantDuration(rawDuration)
  const expiresAt = economy.grantEntitlement(target!, 'subbot_slot', parsed.duration, { grantedBy: ctx.sender, staffGrant: true, permanent: parsed.label === 'permanente' })
  const active = economy.getActiveSubbot(target!)
  if (active) economy.db.prepare('UPDATE subbots SET expires_at = ? WHERE id = ?').run(expiresAt, active.id)
  else economy.createSubbot(target!, expiresAt)
  await ctx.socket.sendMessage(ctx.chatId, { text: `🎁 *SUBBOT REGALADO*\n@${target!.split('@')[0]} recibió acceso *${parsed.label}*.\nVigencia: ${new Date(expiresAt).toLocaleString('es-MX')}`, mentions: [target!] }, { quoted: ctx.message })
}

async function subbotResetAdmin(ctx: CommandContext) {
  const idArg = ctx.args.find((arg) => /^#?\d+$/.test(arg))
  if (idArg) { await subbotManager.resetById(Number(idArg.replace('#', ''))); await ctx.reply(`🧹 Sesión de subbot ${idArg} restablecida.`); return }
  const target = await resolveTarget(ctx, { requiredMessage: 'Indica #ID, menciona o responde al propietario del subbot.' })
  const record = economy.getActiveSubbot(target!)
  if (!record) throw new Error('Ese usuario no tiene una instancia vigente.')
  await subbotManager.resetById(record.id)
  await ctx.reply(`🧹 Sesión del subbot #${record.id} eliminada. La suscripción del usuario permanece vigente.`)
}

async function subbotRevoke(ctx: CommandContext) {
  const target = await resolveTarget(ctx, { requiredMessage: 'Menciona o responde al propietario.' })
  const rows = economy.db.prepare('SELECT id FROM subbots WHERE owner_jid = ? AND expires_at > ?').all(target!, Date.now()) as Array<{ id: number }>
  for (const row of rows) await subbotManager.resetById(row.id)
  economy.db.prepare("UPDATE subbots SET expires_at = ?, status = 'revoked' WHERE owner_jid = ? AND expires_at > ?").run(Date.now(), target!, Date.now())
  economy.db.prepare("DELETE FROM entitlements WHERE user_jid = ? AND kind = 'subbot_slot'").run(target!)
  await ctx.reply('🚫 Acceso de subbot revocado y sesiones eliminadas.')
}

async function botStickerCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'list').toLowerCase()
  if (action === 'list') {
    const rows = globalStickers.list(); await ctx.reply(`🎭 *STICKERS GLOBALES*\n${rows.length ? rows.map((row) => `#${row.id} · ${row.label ?? 'sin etiqueta'}${row.triggers ? ` · triggers: ${row.triggers}` : ''}`).join('\n') : 'No hay stickers configurados.'}`); return
  }
  if (action === 'remove') { await globalStickers.remove(Number(ctx.args[1])); await ctx.reply('✅ Sticker global eliminado.'); return }
  if (action === 'add') {
    const media = await downloadMessageMedia(ctx.message)
    if (!media || media.kind !== 'sticker') throw new Error('Responde al sticker que deseas añadir.')
    const meta = ctx.args.slice(1).join(' ').split('|')
    const label = meta[0]?.trim() || undefined
    const triggers = meta[1]?.split(',').map((item) => item.trim()).filter(Boolean)
    const row = await globalStickers.add(media.buffer, ctx.sender, globalStickers.hashFromMessage(ctx.message), label, triggers)
    await ctx.reply(`✅ Sticker global #${row.id} añadido.${triggers?.length ? `\nTriggers: ${triggers.join(', ')}` : '\nTambién puede aparecer de forma aleatoria.'}`); return
  }
  throw new Error(`Usa ${ctx.prefix}botsticker add [etiqueta | trigger1,trigger2], list o remove <id>.`)
}

async function kickStickerCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'status').toLowerCase()
  if (action === 'clear') { globalStickers.clearAction('kick'); await ctx.reply('✅ Sticker de expulsión desactivado.'); return }
  if (action === 'set') {
    const media = await downloadMessageMedia(ctx.message)
    if (!media || media.kind !== 'sticker') throw new Error('Responde al sticker que deseas usar para expulsar.')
    await globalStickers.setAction('kick', media.buffer, ctx.sender, globalStickers.hashFromMessage(ctx.message))
    await ctx.reply('✅ *STICKER DE EXPULSIÓN CONFIGURADO*\nUn admin de grupo o staff puede enviar ese sticker respondiendo al miembro que desea expulsar.'); return
  }
  await ctx.reply(`🚫 *KICK STICKER*\nConfigurar: ${ctx.prefix}kicksticker set (respondiendo al sticker)\nDesactivar: ${ctx.prefix}kicksticker clear`)
}

async function broadcastCommand(ctx: CommandContext) {
  const text = ctx.argText.trim()
  if (!text) throw new Error(`Uso: ${ctx.prefix}broadcast <mensaje>`)
  const groups = await ctx.socket.groupFetchAllParticipating()
  let sent = 0, failed = 0
  for (const group of Object.values(groups)) {
    try {
      await ctx.socket.sendMessage(group.id, { text: `╭━━〔 📢 *NOVEDADES GHOST NEXORA* 〕━━╮\n${text}\n╰━━━━━━━━━━━━━━━━╯\n\n👻 Usa *${ctx.prefix}menu* para ver las funciones disponibles.` })
      sent += 1
    } catch { failed += 1 }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  await ctx.reply(`📢 Broadcast finalizado.\n✅ Grupos enviados: *${sent}*\n⚠️ Sin permiso/error: *${failed}*`)
}

async function rulesCommand(ctx: CommandContext) {
  if (!ctx.isGroup) throw new Error('Este comando se usa dentro de grupos.')
  const metadata = await ctx.socket.groupMetadata(ctx.chatId)
  const policy = economy.getGroupPolicy(ctx.chatId)
  await ctx.reply([`📜 *REGLAS Y MODERACIÓN · ${metadata.subject}*`, '━━━━━━━━━━━━━━', metadata.desc?.trim() || 'Este grupo no tiene una descripción de reglas configurada.', '', `🔗 Anti-link: *${policy.antiLink ? 'ON' : 'OFF'}* · 3 advertencias`, `🚦 Anti-spam: *${policy.antiSpam ? 'ON' : 'OFF'}* · 3 advertencias`, `👋 Bienvenida: *${policy.welcome ? 'ON' : 'OFF'}*`, `🔞 Adultos: *${policy.adultAllowed ? 'ON' : 'OFF'}*`].join('\n'))
}

async function groupRoleAction(ctx: CommandContext, action: 'remove' | 'promote' | 'demote') {
  const target = await resolveTarget(ctx, { requiredMessage: 'Menciona o responde al usuario objetivo.' })
  await ctx.socket.groupParticipantsUpdate(ctx.chatId, [target!], action)
  await ctx.socket.sendMessage(ctx.chatId, { text: `${action === 'remove' ? '🚫 Expulsado' : action === 'promote' ? '🛡️ Promovido a admin' : '👤 Retirado de admin'}: @${target!.split('@')[0]}`, mentions: [target!] }, { quoted: ctx.message })
}

type ExtraReaction = { name: string; aliases: string[]; category: ReactionCategory; emoji: string; text: string }
const extras: ExtraReaction[] = [
  { name: 'smoke', aliases: ['fumar'], category: 'wave', emoji: '🚬', text: 'se tomó un descanso para fumar' },
  { name: 'drug', aliases: ['drogas'], category: 'spin', emoji: '🌀', text: 'entró en un viaje ficticio de caos' },
  { name: 'slime', aliases: ['smlime', 'slimo'], category: 'happy', emoji: '🟢', text: 'activó el modo slime' },
]

function extraReaction(def: ExtraReaction): BotCommand {
  return { name: def.name, aliases: def.aliases, category: 'social', description: `Reacción social: ${def.name}.`, async handler(ctx) {
    const target = await resolveTarget(ctx)
    const mentions = target ? [ctx.sender, target] : [ctx.sender]
    const caption = `${def.emoji} *@${ctx.sender.split('@')[0]}* ${def.text}${target ? ` junto a *@${target.split('@')[0]}*` : ''}.`
    try { const reaction = await getReactionGif(def.category); const video = await reactionGifToMp4(reaction.url); await ctx.socket.sendMessage(ctx.chatId, { video, gifPlayback: true, caption, mentions }, { quoted: ctx.message }) }
    catch { await ctx.socket.sendMessage(ctx.chatId, { text: caption, mentions }, { quoted: ctx.message }) }
  } }
}

async function adultRole(ctx: CommandContext, kind: 'fuck' | 'cum' | 'preñar') {
  const policy = ctx.isGroup ? economy.getGroupPolicy(ctx.chatId).adultAllowed : config.adultPrivateEnabled
  if (!policy || !economy.hasEntitlement(ctx.sender, 'adult_consent')) throw new Error(`Debes habilitar el módulo 18+ y confirmar mayoría de edad con ${ctx.prefix}adult18 accept.`)
  const target = await resolveTarget(ctx, { requiredMessage: 'Menciona o responde a otro usuario con consentimiento 18+.' })
  if (!economy.hasEntitlement(target!, 'adult_consent')) throw new Error('El usuario respondido/mencionado no ha confirmado acceso 18+.')
  const tags = kind === 'cum' ? 'rating:explicit hentai cum' : kind === 'preñar' ? 'rating:explicit hentai sex' : 'rating:explicit hentai sex'
  const posts = await searchGelbooru(tags, 12).catch(() => [])
  const post = posts.filter((item) => !item.tags || !/(loli|shota|minor|child|young)/i.test(item.tags)).sort(() => Math.random() - 0.5)[0]
  const caption = `🔞 *ROLEPLAY 18+ · ${kind.toUpperCase()}*\n━━━━━━━━━━━━━━\n@${ctx.sender.split('@')[0]} y @${target!.split('@')[0]} iniciaron una reacción consensuada para adultos.\n✓ Ambos tienen consentimiento 18+ registrado.`
  if (post?.imageUrl) await ctx.socket.sendMessage(ctx.chatId, { image: { url: post.imageUrl }, caption, mentions: [ctx.sender, target!] }, { quoted: ctx.message }).catch(async () => ctx.socket.sendMessage(ctx.chatId, { text: caption, mentions: [ctx.sender, target!] }, { quoted: ctx.message }))
  else await ctx.socket.sendMessage(ctx.chatId, { text: caption, mentions: [ctx.sender, target!] }, { quoted: ctx.message })
}

async function waifuRoll(ctx: CommandContext) {
  const result = await createV2WaifuRoll(ctx.sender)
  if (!result.ok) throw new Error(`Espera ${waitText(result.remaining)} antes de otro roll.`)
  const c = result.character
  await ctx.socket.sendMessage(ctx.chatId, { image: { url: c.imageUrl }, caption: `🌸 *NEXORA WAIFU · JIKAN*\n━━━━━━━━━━━━━━\n${rarityEmoji(c.rarity)} *${c.name}*\n🆔 MAL: ${c.characterId}\n❤️ Favoritos: ${c.favorites.toLocaleString('es-MX')}\n💎 Valor: ${fmt(c.value)}\n🪙 Claim: ${fmt(c.claimPrice)}\n${result.owner ? '🔒 Ya pertenece a otro usuario.' : `✅ Disponible · reclama con *${ctx.prefix}claim*`}` }, { quoted: ctx.message })
}

async function waifuSearch(ctx: CommandContext) {
  const query = ctx.argText.trim(); if (!query) throw new Error('Indica un personaje.')
  const rows = await jikanSearchCharacters(query, 8); if (!rows.length) throw new Error('Jikan no devolvió resultados.')
  await ctx.reply(`🔎 *JIKAN · PERSONAJES*\n${rows.map((c, i) => `${i + 1}. ${rarityEmoji(c.rarity)} *${c.name}* · MAL ${c.characterId} · ❤️ ${c.favorites.toLocaleString('es-MX')}\n   Info: *${ctx.prefix}winfo ${c.characterId}*`).join('\n\n')}`)
}

async function waifuInfoV2(ctx: CommandContext) {
  const id = Number(ctx.args[0]); if (!Number.isInteger(id) || id <= 0) throw new Error('Indica el ID de MyAnimeList.')
  const c = await jikanCharacter(id); const owner = getClaim(id)?.ownerJid
  await ctx.socket.sendMessage(ctx.chatId, { image: { url: c.imageUrl }, caption: `${rarityEmoji(c.rarity)} *${c.name}*\n🆔 MAL ${c.characterId}\n❤️ ${c.favorites.toLocaleString('es-MX')} favoritos\n💎 ${fmt(c.value)}\n${owner ? `🔒 Propietario: @${owner.split('@')[0]}` : '✅ Disponible'}`, mentions: owner ? [owner] : [] }, { quoted: ctx.message })
}

async function waifuGiveV2(ctx: CommandContext) {
  const target = await resolveTarget(ctx, { requiredMessage: 'Menciona o responde al usuario que recibirá el personaje.' })
  const id = Number(ctx.args.find((arg) => /^\d{1,8}$/.test(arg))); if (!id) throw new Error('Indica el ID del personaje.')
  const claim = giveWaifu(ctx.sender, target!, id)
  await ctx.socket.sendMessage(ctx.chatId, { text: `🎁 *${claim.name}* fue transferida a @${target!.split('@')[0]}.`, mentions: [target!] }, { quoted: ctx.message })
}

async function haremV2(ctx: CommandContext) {
  const target = await resolveTarget(ctx) ?? ctx.sender
  const page = Number(ctx.args.find((arg) => /^\d{1,3}$/.test(arg)) ?? 1)
  const result = listHarem(target, page, 10)
  if (!result.items.length) throw new Error('No hay personajes en esa colección.')
  await ctx.reply(`💞 *HAREM · ${result.total} PERSONAJES*\nValor: *${fmt(result.totalValue)}* · Página ${result.page}/${result.totalPages}\n\n${result.items.map((item) => `${rarityEmoji(item.rarity)} *${item.name}* · #${item.characterId} · ${fmt(item.value)}`).join('\n')}`)
}

export const v2Commands: BotCommand[] = [
  { name: 'menu', aliases: ['help', 'comandos'], category: 'general', description: 'Menú dividido por categorías.', handler: menuCommand },
  { name: 'rules', aliases: ['reglas'], category: 'groups', description: 'Muestra reglas y estado de moderación del grupo.', groupOnly: true, handler: rulesCommand },
  { name: 'balance', aliases: ['bal', 'wallet', 'cartera', 'banco'], category: 'economy', description: 'Consulta la billetera NXC global.', handler: balanceCommand },
  { name: 'job', aliases: ['profession', 'profesion', 'empleo'], category: 'economy', description: 'Elige una profesión entre 20 oficios.', handler: jobCommand },
  { name: 'work', aliases: ['w', 'trabajar', 'trabajo'], category: 'economy', description: 'Trabaja con cooldown de un minuto.', handler: workCommand },
  { name: 'transfer', aliases: ['pay', 'send', 'enviar', 'transferir'], category: 'economy', description: 'Transfiere NXC a la billetera global de otro usuario.', handler: transferCommand },
  { name: 'top', aliases: ['rich', 'leaderboard', 'topcoins', 'baltop', 'topgrupo'], category: 'economy', description: 'Top económico del grupo actual.', handler: (ctx) => topCommand(ctx, false) },
  { name: 'topglobal', aliases: ['balglobal'], category: 'economy', description: 'Top económico global del bot.', handler: (ctx) => topCommand(ctx, true) },
  { name: 'loan', aliases: ['prestamo'], category: 'economy', description: 'Solicita, consulta o paga un préstamo bancario.', handler: loanCommand },
  { name: 'paydebt', aliases: ['pagardeuda', 'payloan', 'pagarprestamo'], category: 'economy', description: 'Paga tu préstamo/deuda activa.', handler: async (ctx) => { ctx.args.unshift('pay'); await loanCommand(ctx) } },
  { name: 'lend', aliases: ['prestar'], category: 'economy', description: 'Presta NXC a un usuario por mención o respuesta.', handler: lendCommand },
  { name: 'rob', aliases: ['robar', 'steal'], category: 'economy', description: 'Intenta robar NXC; cooldown de un minuto.', handler: robCommand },
  { name: 'crime', aliases: ['crimen'], category: 'economy', description: 'Crimen de riesgo; cooldown de un minuto.', async handler(ctx) { const r = economyV2.crime(ctx.sender); if (!r.ok) throw new Error(`Vuelve en ${waitText(r.remaining)}.`); await ctx.reply(r.success ? `🕶️ Crimen exitoso: *+${fmt(r.amount)}*` : `🚓 Te atraparon: *-${fmt(r.amount)}*`) } },
  { name: 'slut', aliases: ['atrevido'], category: 'economy', description: 'Trabajo atrevido; cooldown de un minuto.', async handler(ctx) { const r = economyV2.daring(ctx.sender); if (!r.ok) throw new Error(`Vuelve en ${waitText(r.remaining)}.`); await ctx.reply(r.success ? `❤️‍🔥 Ganaste *${fmt(r.amount)}*.` : `💸 Perdiste *${fmt(r.amount)}*.`) } },
  { name: 'miner', aliases: ['minero', 'mining'], category: 'economy', description: 'Gestiona mineros pasivos de NXC.', handler: minerCommand },
  { name: 'shop', aliases: ['store', 'tienda'], category: 'economy', description: 'Tienda de accesos, subbots y mineros.', handler: shopCommand },
  { name: 'buy', aliases: ['comprar'], category: 'economy', description: 'Compra un producto de Nexora Store.', handler: buyCommand },
  { name: 'yts', aliases: ['ytsearch', 'buscarvideo'], category: 'downloads', description: 'Único comando de búsqueda en YouTube.', handler: ytsCommand },
  { name: 'ytmp3', aliases: ['yta', 'ytaudio'], category: 'downloads', description: 'Descarga audio de un enlace YouTube mediante API Lempi.', handler: (ctx) => sendYoutube(ctx, 'audio', ctx.args[0] ?? '') },
  { name: 'ytmp4', aliases: ['ytv', 'ytvideo'], category: 'downloads', description: 'Descarga video de un enlace YouTube mediante API Lempi.', handler: (ctx) => sendYoutube(ctx, 'video', ctx.args[0] ?? '', Number(ctx.args[1] ?? 720)) },
  { name: 'play', aliases: ['playaudio'], category: 'downloads', description: 'Descarga audio; solo acepta enlace YouTube.', handler: (ctx) => sendYoutube(ctx, 'audio', ctx.args[0] ?? '') },
  { name: 'playvideo', aliases: ['playvid'], category: 'downloads', description: 'Descarga video; solo acepta enlace YouTube.', handler: (ctx) => sendYoutube(ctx, 'video', ctx.args[0] ?? '', 720) },
  { name: 'facebook', aliases: ['fb'], category: 'downloads', description: 'Descarga video de Facebook con respaldo Lempi.', handler: facebookCommand },
  { name: 'xvideos', aliases: ['xv'], category: 'adult', description: 'Busca o descarga XVideos con formato compatible.', handler: (ctx) => adultSearchOrDownload(ctx, 'xvideos') },
  { name: 'xnxx', aliases: ['xn'], category: 'adult', description: 'Busca o descarga XNXX con formato compatible.', handler: (ctx) => adultSearchOrDownload(ctx, 'xnxx') },
  { name: 'pornhub', aliases: ['ph'], category: 'adult', description: 'Busca o descarga Pornhub sin carrusel incompatible.', handler: (ctx) => adultSearchOrDownload(ctx, 'pornhub') },
  { name: 'adultdl', aliases: ['18dl'], category: 'adult', description: 'Descarga un resultado 18+ por URL.', handler: (ctx) => adultDownload(ctx, /xvideos/i.test(ctx.args[0] ?? '') ? 'xvideos' : /xnxx/i.test(ctx.args[0] ?? '') ? 'xnxx' : 'pornhub', ctx.args[0] ?? '') },
  { name: 'subbot', aliases: ['jadibot', 'serbot'], category: 'subbots', description: 'Gestiona, vincula o borra tu sesión de subbot.', handler: subbotCommand },
  { name: 'addnxc', aliases: ['givencx', 'grantnxc'], category: 'owner', description: 'Añade NXC a un usuario.', staffOnly: true, handler: addNxc },
  { name: 'subbotgrant', aliases: ['givesubbot'], category: 'owner', description: 'Regala acceso de subbot por tiempo o permanente.', staffOnly: true, handler: subbotGrant },
  { name: 'subbotreset', aliases: ['resetsubbot'], category: 'owner', description: 'Borra credenciales de una sesión subbot.', staffOnly: true, handler: subbotResetAdmin },
  { name: 'subbotrevoke', aliases: ['revokesubbot'], category: 'owner', description: 'Revoca acceso y sesiones de subbot.', staffOnly: true, handler: subbotRevoke },
  { name: 'botsticker', aliases: ['globalsticker'], category: 'owner', description: 'Administra stickers globales del bot.', staffOnly: true, handler: botStickerCommand },
  { name: 'kicksticker', aliases: ['stickerkick'], category: 'owner', description: 'Configura el sticker global de expulsión.', staffOnly: true, handler: kickStickerCommand },
  { name: 'broadcast', aliases: ['bc', 'anunciar'], category: 'owner', description: 'Envía un anuncio a todos los grupos accesibles.', staffOnly: true, handler: broadcastCommand },
  { name: 'kick', aliases: ['remove', 'expulsar'], category: 'groups', description: 'Expulsa por mención o respuesta.', groupOnly: true, adminOnly: true, botAdminOnly: true, handler: (ctx) => groupRoleAction(ctx, 'remove') },
  { name: 'promote', aliases: ['daradmin'], category: 'groups', description: 'Da admin por mención o respuesta.', groupOnly: true, adminOnly: true, botAdminOnly: true, handler: (ctx) => groupRoleAction(ctx, 'promote') },
  { name: 'demote', aliases: ['quitaradmin'], category: 'groups', description: 'Quita admin por mención o respuesta.', groupOnly: true, adminOnly: true, botAdminOnly: true, handler: (ctx) => groupRoleAction(ctx, 'demote') },
  ...extras.map(extraReaction),
  { name: 'fuck', aliases: ['room'], category: 'adult', description: 'Reacción 18+ consensuada.', handler: (ctx) => adultRole(ctx, 'fuck') },
  { name: 'cum', aliases: ['finishrp'], category: 'adult', description: 'Reacción 18+ consensuada.', handler: (ctx) => adultRole(ctx, 'cum') },
  { name: 'preñar', aliases: ['prenar'], category: 'adult', description: 'Roleplay 18+ consensuado.', handler: (ctx) => adultRole(ctx, 'preñar') },
  { name: 'waifu', aliases: ['rw', 'rollwaifu', 'rollw'], category: 'collection', description: 'Roll de personaje con cliente Jikan robusto.', handler: waifuRoll },
  { name: 'wsearch', aliases: ['waifusearch', 'buscarwaifu'], category: 'collection', description: 'Busca personajes en Jikan.', handler: waifuSearch },
  { name: 'winfo', aliases: ['waifuinfo', 'charinfo'], category: 'collection', description: 'Información de personaje Jikan/MAL.', handler: waifuInfoV2 },
  { name: 'wgive', aliases: ['givewaifu', 'regalarwaifu'], category: 'collection', description: 'Regala un personaje por mención o respuesta.', handler: waifuGiveV2 },
  { name: 'harem', aliases: ['collection', 'coleccion', 'waifus', 'mywaifus'], category: 'collection', description: 'Colección propia o del usuario respondido.', handler: haremV2 },
]
