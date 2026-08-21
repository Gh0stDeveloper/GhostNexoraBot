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
import { getMessageText } from './utils/message.js'
import { logger } from './utils/logger.js'

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

async function maybeAutoReact(socket: Awaited<ReturnType<typeof createSocket>>['socket'], message: Parameters<CommandRouter['handle']>[1]) {
  if (!config.autoReact || message.key.fromMe || !message.key.remoteJid) return
  const text = getMessageText(message).toLowerCase().trim()
  if (!text) return
  let emoji: string | null = null
  if (/^(hola|holi|buenas|buenos dias|buenas tardes|buenas noches)\b/.test(text)) emoji = '👋'
  else if (/\b(gracias|thank you|thanks)\b/.test(text)) emoji = '❤️'
  else if (/\b(jaja+|jeje+|xd+)\b/.test(text)) emoji = '😂'
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

  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const message of messages) {
      if (!message.message || !message.key.remoteJid || message.key.remoteJid === 'status@broadcast') continue
      await routeMessage(socket, message, router)
    }
  })
  socket.ev.on('group-participants.update', (update) => void handleParticipantUpdate(socket, update as never))

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
