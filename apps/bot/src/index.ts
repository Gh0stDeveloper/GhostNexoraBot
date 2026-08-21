import http from 'node:http'
import { Boom } from '@hapi/boom'
import { DisconnectReason } from 'baileys'
import qrcode from 'qrcode-terminal'
import { config } from './config.js'
import { createSocket } from './core/session.js'
import { CommandRouter } from './core/router.js'
import { settings } from './core/settings.js'
import { subbotManager } from './core/subbots.js'
import { commands } from './commands/index.js'
import { economy } from './services/economy.js'
import { handleParticipantUpdate, moderateIncoming } from './services/moderation.js'
import { startTempCleanup } from './services/temp-cleanup.js'
import { getMessageText, unwrapMessage } from './utils/message.js'
import { logger } from './utils/logger.js'
import { withTimeout } from './utils/timeout.js'

const startedAt = new Date()
let connected = false
let connectedAt: Date | null = null
let activeJid: string | null = null
let reconnectTimer: NodeJS.Timeout | null = null
const subbotRouters = new Map<number, CommandRouter>()

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: 'not_found' }))
      return
    }
    const subbots = economy.listSubbots()
    res.writeHead(connected ? 200 : 503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify({
      ok: connected, service: 'ghost-nexora-bot', botName: config.botName, prefix: settings.prefix,
      connected, connectedAt: connectedAt?.toISOString() ?? null, startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor(process.uptime()), activeJid,
      subbots: { total: subbots.length, online: subbots.filter((item) => item.status === 'online').length },
    }))
  })
  server.listen(config.healthPort, '127.0.0.1', () => logger.info({ port: config.healthPort }, 'health server listening'))
}

function pick<T>(values: readonly T[]) {
  return values[Math.floor(Math.random() * values.length)]!
}

async function maybeAutoReact(socket: Awaited<ReturnType<typeof createSocket>>['socket'], message: Parameters<CommandRouter['handle']>[1]) {
  if (!config.autoReact || message.key.fromMe || !message.key.remoteJid) return
  const text = getMessageText(message).toLowerCase().trim()
  let emoji: string | null = null

  const rules: Array<[RegExp, readonly string[]]> = [
    [/\b(feliz cumple|felicidades|happy birthday)\b/, ['🎂', '🎉', '🥳', '🎈']],
    [/\b(buenos dias|buen día|buen dia)\b/, ['☀️', '🌤️', '👋', '✨']],
    [/\b(buenas noches|dulces sueños)\b/, ['🌙', '🌌', '😴', '✨']],
    [/^(hola|holi|holaa+|hey|buenas|qué tal|que tal)\b/, ['👋', '😊', '✨', '🤝', '👻']],
    [/\b(gracias|muchas gracias|thank you|thanks|ty)\b/, ['❤️', '🫶', '💙', '💜', '✨']],
    [/\b(jaja+|jeje+|jiji+|xd+|lol|lmao)\b/, ['😂', '🤣', '😹', '💀', '😆']],
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

  for (const [pattern, emojis] of rules) {
    if (pattern.test(text)) { emoji = pick(emojis); break }
  }

  if (!emoji && !text) {
    const content = unwrapMessage(message.message)
    if (content?.imageMessage) emoji = pick(['📸', '✨', '🔥', '💫'])
    else if (content?.videoMessage) emoji = pick(['🎬', '🔥', '👏', '✨'])
    else if (content?.stickerMessage) emoji = pick(['😄', '✨', '👻', '😂'])
  }

  if (emoji) await socket.sendMessage(message.key.remoteJid, { react: { text: emoji, key: message.key } }).catch(() => undefined)
}

async function routeMessage(socket: Awaited<ReturnType<typeof createSocket>>['socket'], message: Parameters<CommandRouter['handle']>[1], router: CommandRouter) {
  if (await moderateIncoming(socket, message)) return
  const handled = await router.handle(socket, message)
  if (!handled) await maybeAutoReact(socket, message)
}

async function connect() {
  const { socket } = await createSocket()
  const router = new CommandRouter(commands)

  socket.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return
    for (const message of messages) {
      if (!message.message || !message.key.remoteJid || message.key.remoteJid === 'status@broadcast') continue
      const chatId = message.key.remoteJid
      void withTimeout(routeMessage(socket, message, router), 60_000, `routeMessage ${chatId}`)
        .catch((error) => logger.error({ error, chatId }, 'mensaje colgado o falló'))
    }
  })

  socket.ev.on('group-participants.update', (update) => {
    void handleParticipantUpdate(socket, update)
      .catch((error) => logger.error({ error, groupId: update.id, action: update.action }, 'participant update failed'))
  })

  socket.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr && !socket.authState.creds.registered) {
      logger.warn('session is not linked; showing QR fallback in terminal')
      qrcode.generate(qr, { small: true })
      logger.warn('recommended: run `npm run pair` to link with a phone-number pairing code')
    }
    if (connection === 'open') {
      connected = true
      connectedAt = new Date()
      activeJid = socket.user?.id ?? null
      logger.info({ jid: activeJid, prefix: settings.prefix }, `${config.botName} connected`)
    }
    if (connection === 'close') {
      connected = false
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
      const loggedOut = statusCode === DisconnectReason.loggedOut
      logger.warn({ statusCode, loggedOut }, 'WhatsApp connection closed')
      if (loggedOut) {
        logger.error('session logged out; run `npm run pair` to link again')
        return
      }
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          void connect().catch((error) => logger.error({ error }, 'reconnect failed'))
        }, 3000)
      }
    }
  })
}

await settings.init()
startTempCleanup()
startHealthServer()
subbotManager.setMessageHandler(async (socket, message, record) => {
  let router = subbotRouters.get(record.id)
  if (!router) {
    router = new CommandRouter(commands, { instanceId: record.id, instanceOwnerJid: record.ownerJid })
    subbotRouters.set(record.id, router)
  }
  await routeMessage(socket, message, router)
})
await subbotManager.startActive()
await connect()

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))
process.on('unhandledRejection', (error) => logger.error({ error }, 'unhandled rejection'))
process.on('uncaughtException', (error) => logger.fatal({ error }, 'uncaught exception'))
