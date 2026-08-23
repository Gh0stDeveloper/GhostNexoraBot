import http from 'node:http'
import { Boom } from '@hapi/boom'
import { DisconnectReason, type WASocket } from 'baileys'
import qrcode from 'qrcode-terminal'
import { config } from './config.js'
import { createSocket } from './core/session.js'
import { CommandRouter } from './core/router.js'
import { settings } from './core/settings.js'
import { subbotManager } from './core/subbots.js'
import { commands } from './commands/index.js'
import { economy } from './services/economy.js'
import { economyV2 } from './services/economy-v2.js'
import { handleParticipantUpdateV2, moderateIncomingV2 } from './services/moderation-v2.js'
import { observeMessageIdentity, resolveStoredIdentity } from './services/identity.js'
import { handleKickSticker, maybeSendHumanSticker } from './services/human-stickers.js'
import { startTempCleanup } from './services/temp-cleanup.js'
import { getMessageText, unwrapMessage } from './utils/message.js'
import { logger } from './utils/logger.js'
import { withTimeout } from './utils/timeout.js'

const startedAt = new Date()
let connected = false
let connectedAt: Date | null = null
let activeJid: string | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let mainSocket: WASocket | null = null
const subbotRouters = new Map<number, CommandRouter>()

function json(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(payload))
}

async function readJson(req: http.IncomingMessage) {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > 128 * 1024) throw new Error('Payload demasiado grande.')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>
}

function controlJid(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) throw new Error('Falta userJid.')
  if (raw.includes('@')) return resolveStoredIdentity(raw)
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) throw new Error('Usuario inválido.')
  return resolveStoredIdentity(`${digits}@s.whatsapp.net`)
}

async function executeControl(payload: Record<string, unknown>) {
  const action = String(payload.action ?? '')
  if (action === 'add_nxc') {
    const userJid = controlJid(payload.userJid)
    const amount = Number(payload.amount)
    const balance = economyV2.credit(userJid, amount, 'web_admin_grant')
    return { ok: true, userJid, balance }
  }
  if (action === 'grant_subbot') {
    const userJid = controlJid(payload.userJid)
    const durationMs = String(payload.duration ?? '').toLowerCase() === 'permanent'
      ? 100 * 365 * 86400_000
      : Math.max(3600_000, Number(payload.durationMs ?? 7 * 86400_000))
    const expiresAt = economy.grantEntitlement(userJid, 'subbot_slot', durationMs, { webGrant: true })
    const active = economy.getActiveSubbot(userJid)
    const id = active?.id ?? economy.createSubbot(userJid, expiresAt)
    economy.db.prepare('UPDATE subbots SET expires_at = ? WHERE id = ?').run(expiresAt, id)
    return { ok: true, id, userJid, expiresAt }
  }
  if (action === 'reset_subbot') {
    const id = Number(payload.id)
    if (!Number.isInteger(id) || id <= 0) throw new Error('ID de subbot inválido.')
    const record = await subbotManager.resetById(id)
    return { ok: true, record }
  }
  if (action === 'reset_own_subbot') {
    const id = Number(payload.id)
    const userJid = controlJid(payload.userJid)
    const record = economy.listSubbots().find((item) => item.id === id && item.ownerJid === userJid && item.expiresAt > Date.now())
    if (!record) throw new Error('No tienes permiso sobre esa instancia.')
    await subbotManager.resetById(id)
    return { ok: true, id }
  }
  if (action === 'broadcast') {
    if (!mainSocket) throw new Error('MainBot no está conectado.')
    const message = String(payload.message ?? '').trim().slice(0, 5000)
    if (!message) throw new Error('Mensaje vacío.')
    const groups = await mainSocket.groupFetchAllParticipating()
    let sent = 0, failed = 0
    for (const group of Object.values(groups)) {
      try {
        await mainSocket.sendMessage(group.id, { text: `╭━━〔 📢 *NOVEDADES GHOST NEXORA* 〕━━╮\n${message}\n╰━━━━━━━━━━━━━━━━╯\n\n👻 Usa *${settings.prefix}menu* para explorar las funciones.` })
        sent += 1
      } catch { failed += 1 }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return { ok: true, sent, failed }
  }
  throw new Error('Acción de control no soportada.')
}

function startHealthServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/control') {
      const auth = req.headers.authorization ?? ''
      if (auth !== `Bearer ${config.adminWebToken}`) { json(res, 401, { ok: false, error: 'unauthorized' }); return }
      try { json(res, 200, await executeControl(await readJson(req))) }
      catch (error) {
        logger.warn({ error }, 'admin control request failed')
        json(res, 400, { ok: false, error: error instanceof Error ? error.message : 'control_failed' })
      }
      return
    }
    if (req.url !== '/health') { json(res, 404, { ok: false, error: 'not_found' }); return }
    const subbots = economy.listSubbots()
    json(res, connected ? 200 : 503, {
      ok: connected, service: 'ghost-nexora-bot', botName: config.botName, prefix: settings.prefix,
      connected, connectedAt: connectedAt?.toISOString() ?? null, startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor(process.uptime()), activeJid,
      subbots: { total: subbots.length, online: subbots.filter((item) => item.status === 'online').length },
    })
  })
  server.listen(config.healthPort, '127.0.0.1', () => logger.info({ port: config.healthPort }, 'health/control server listening'))
}

function pick<T>(values: readonly T[]) { return values[Math.floor(Math.random() * values.length)]! }

async function maybeAutoReact(socket: Awaited<ReturnType<typeof createSocket>>['socket'], message: Parameters<CommandRouter['handle']>[1]) {
  if (!config.autoReact || message.key.fromMe || !message.key.remoteJid) return
  const text = getMessageText(message).toLowerCase().trim()
  let emoji: string | null = null
  const rules: Array<[RegExp, readonly string[]]> = [
    [/(?:^|\s):v(?:\s|$)/i, ['🗿', '😂', '😏', '👻']],
    [/\b(feliz cumple|felicidades|happy birthday)\b/, ['🎂', '🎉', '🥳', '🎈']],
    [/\b(buenos dias|buen día|buen dia)\b/, ['☀️', '🌤️', '👋', '✨']],
    [/\b(buenas noches|dulces sueños)\b/, ['🌙', '🌌', '😴', '✨']],
    [/^(hola|holi|holaa+|hey|buenas|qué tal|que tal)\b/, ['👋', '😊', '✨', '🤝', '👻']],
    [/\b(gracias|muchas gracias|thank you|thanks|ty)\b/, ['❤️', '🫶', '💙', '💜', '✨']],
    [/\b(jaja+|jeje+|jiji+|xd+|lol|lmao|ksks+)\b/, ['😂', '🤣', '😹', '💀', '😆']],
    [/\b(te amo|te quiero|love you|ily|amor)\b/, ['❤️', '💞', '🥰', '💕', '❤️‍🔥']],
    [/\b(triste|ando mal|estoy mal|llorar|lloro|sad)\b/, ['🥺', '😢', '💙', '🫂']],
    [/\b(increíble|increible|genial|brutal|épico|epico|wow|woow+)\b/, ['🤯', '🔥', '✨', '👏', '💯']],
    [/\b(gol|ganamos|victoria|winner|campeón|campeon)\b/, ['🏆', '🔥', '🎉', '👏']],
    [/\b(música|musica|canción|cancion|rolita|song)\b/, ['🎵', '🎧', '🎶', '🔥']],
    [/\b(programar|programación|programacion|código|codigo|python|javascript|typescript|api)\b/, ['💻', '🧠', '⚙️', '🚀']],
    [/\b(nexora|bot|ghost developer|ghostnexora)\b/, ['👻', '🤖', '⚡', '✨']],
    [/\b(hambre|comida|pizza|tacos|cenar|desayuno)\b/, ['😋', '🍕', '🌮', '🍽️']],
    [/\b(hermos[oa]|bonit[oa]|lind[oa]|cute|precioso)\b/, ['🥰', '💖', '✨', '😍']],
    [/\b(buen trabajo|bien hecho|good job|excelente)\b/, ['👏', '✅', '🔥', '💯']],
    [/\b(ya quedó|funciona|funcionó|funciono|resuelto|solucionado)\b/, ['✅', '🎉', '🔥', '🚀']],
  ]
  for (const [pattern, emojis] of rules) if (pattern.test(text)) { emoji = pick(emojis); break }
  if (!emoji && !text) {
    const content = unwrapMessage(message.message)
    if (content?.imageMessage) emoji = pick(['📸', '✨', '🔥', '💫'])
    else if (content?.videoMessage) emoji = pick(['🎬', '🔥', '👏', '✨'])
    else if (content?.stickerMessage) emoji = pick(['😄', '✨', '👻', '😂'])
  }
  if (emoji) await socket.sendMessage(message.key.remoteJid, { react: { text: emoji, key: message.key } }).catch(() => undefined)
}

async function routeMessage(socket: Awaited<ReturnType<typeof createSocket>>['socket'], message: Parameters<CommandRouter['handle']>[1], router: CommandRouter) {
  await observeMessageIdentity(socket, message).catch((error) => logger.debug({ error }, 'identity observation skipped'))
  if (await handleKickSticker(socket, message).catch(() => false)) return
  if (await moderateIncomingV2(socket, message)) return
  const handled = await router.handle(socket, message)
  if (!handled) {
    await maybeAutoReact(socket, message)
    await maybeSendHumanSticker(socket, message).catch(() => false)
  }
}

async function connect() {
  const { socket } = await createSocket()
  mainSocket = socket
  const router = new CommandRouter(commands)
  socket.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return
    for (const message of messages) {
      if (!message.message || !message.key.remoteJid || message.key.remoteJid === 'status@broadcast') continue
      const chatId = message.key.remoteJid
      void withTimeout(routeMessage(socket, message, router), 60_000, `routeMessage ${chatId}`).catch((error) => logger.error({ error, chatId }, 'mensaje colgado o falló'))
    }
  })
  socket.ev.on('group-participants.update', (update) => {
    void handleParticipantUpdateV2(socket, update).catch((error) => logger.error({ error, groupId: update.id, action: update.action }, 'participant update failed'))
  })
  socket.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr && !socket.authState.creds.registered) {
      logger.warn('session is not linked; showing QR fallback in terminal')
      qrcode.generate(qr, { small: true })
      logger.warn('recommended: run `npm run pair` to link with a phone-number pairing code')
    }
    if (connection === 'open') {
      connected = true; connectedAt = new Date(); activeJid = socket.user?.id ?? null; mainSocket = socket
      logger.info({ jid: activeJid, prefix: settings.prefix }, `${config.botName} connected`)
    }
    if (connection === 'close') {
      connected = false
      if (mainSocket === socket) mainSocket = null
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
      const loggedOut = statusCode === DisconnectReason.loggedOut
      logger.warn({ statusCode, loggedOut }, 'WhatsApp connection closed')
      if (loggedOut) { logger.error('session logged out; run `npm run pair` to link again'); return }
      if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; void connect().catch((error) => logger.error({ error }, 'reconnect failed')) }, 3000)
    }
  })
}

await settings.init()
startTempCleanup()
startHealthServer()
subbotManager.setMessageHandler(async (socket, message, record) => {
  let router = subbotRouters.get(record.id)
  if (!router) { router = new CommandRouter(commands, { instanceId: record.id, instanceOwnerJid: record.ownerJid }); subbotRouters.set(record.id, router) }
  await routeMessage(socket, message, router)
})
await subbotManager.startActive()
await connect()

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))
process.on('unhandledRejection', (error) => logger.error({ error }, 'unhandled rejection'))
process.on('uncaughtException', (error) => logger.fatal({ error }, 'uncaught exception'))
