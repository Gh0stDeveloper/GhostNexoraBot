import http from 'node:http'
import { Boom } from '@hapi/boom'
import { DisconnectReason, type WASocket } from 'baileys'
import qrcode from 'qrcode-terminal'
import { config } from './config.js'
import { createSocket } from './core/session.js'
import { CommandRouter } from './core/router.js'
import { settings } from './core/settings.js'
import { subbotManager } from './core/subbots.js'
import { termuxLiteCommands } from './commands/termux-lite.js'
import { economy } from './services/economy.js'
import { handleParticipantUpdateV2, moderateIncomingV2 } from './services/moderation-v2.js'
import { observeMessageIdentity, resolveStoredIdentity } from './services/identity.js'
import { handleKickSticker } from './services/human-stickers.js'
import { maybeHumanInteraction } from './services/human-behavior-v8.js'
import { startTempCleanup } from './services/temp-cleanup.js'
import { observeGroupActivity } from './services/progression-v4.js'
import { startAutomationScheduler } from './services/automation-v4.js'
import { getMessageText, getSender } from './utils/message.js'
import { logger } from './utils/logger.js'
import { withTimeout } from './utils/timeout.js'
import { groupControlsV9, handleAntiViewOnce } from './services/group-controls-v9.js'

if (!config.isTermuxLite) throw new Error('termux-lite.ts requiere NEXORA_RUNTIME_PROFILE=termux-lite')
process.title = 'ghost-nexora-termux-lite'

const startedAt = new Date()
let connected = false
let connectedAt: Date | null = null
let activeJid: string | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let mainSocket: WASocket | null = null

function json(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(payload))
}

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url !== '/health') {
      json(res, 404, { ok: false, error: 'not_found' })
      return
    }
    const subbots = economy.listSubbots()
    json(res, connected ? 200 : 503, {
      ok: connected,
      service: 'ghost-nexora-bot',
      profile: 'termux-lite',
      botName: config.botName,
      prefix: settings.prefix,
      connected,
      connectedAt: connectedAt?.toISOString() ?? null,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      activeJid,
      llm: false,
      web: false,
      subbots: {
        total: subbots.length,
        online: subbots.filter((item) => item.status === 'online').length,
      },
    })
  })
  server.listen(config.healthPort, '127.0.0.1', () => {
    logger.info({ port: config.healthPort, profile: config.runtimeProfile }, 'Termux Lite health server listening')
  })
}

async function routeMessage(
  socket: Awaited<ReturnType<typeof createSocket>>['socket'],
  message: Parameters<CommandRouter['handle']>[1],
  router: CommandRouter,
) {
  await observeMessageIdentity(socket, message).catch((error) => logger.debug({ error }, 'identity observation skipped'))

  const chatId = message.key.remoteJid
  const text = getMessageText(message).trim()

  if (chatId && !message.key.fromMe) {
    observeGroupActivity(
      chatId,
      resolveStoredIdentity(getSender(message)),
      chatId.endsWith('@g.us'),
      text.startsWith(settings.prefix),
    )
  }

  if (await handleAntiViewOnce(socket, message).catch((error) => {
    logger.warn({ error, chatId }, 'anti view-once handler failed')
    return false
  })) return

  if (await handleKickSticker(socket, message).catch(() => false)) return
  if (await moderateIncomingV2(socket, message)) return

  const handled = await router.handle(socket, message)
  if (handled) return

  if (chatId?.endsWith('@g.us') && groupControlsV9.get(chatId).restrictedMode) return
  await maybeHumanInteraction(socket, message).catch(() => false)
}

async function connect() {
  const { socket } = await createSocket()
  mainSocket = socket
  const router = new CommandRouter(termuxLiteCommands)

  socket.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return
    for (const message of messages) {
      if (!message.message || !message.key.remoteJid || message.key.remoteJid === 'status@broadcast') continue
      const chatId = message.key.remoteJid
      void withTimeout(routeMessage(socket, message, router), config.botMessageTimeoutMs, `termux routeMessage ${chatId}`)
        .catch((error) => logger.error({ error, chatId }, 'Termux Lite message failed'))
    }
  })

  socket.ev.on('group-participants.update', (update) => {
    void handleParticipantUpdateV2(socket, update).catch((error) =>
      logger.error({ error, groupId: update.id, action: update.action }, 'participant update failed'))
  })

  socket.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr && !socket.authState.creds.registered) {
      logger.warn('Termux Lite session is not linked; showing QR fallback')
      qrcode.generate(qr, { small: true })
      logger.warn('Recommended: run `ghostnexora pair <number>`')
    }
    if (connection === 'open') {
      connected = true
      connectedAt = new Date()
      activeJid = socket.user?.id ?? null
      mainSocket = socket
      logger.info({ jid: activeJid, prefix: settings.prefix, profile: config.runtimeProfile }, `${config.botName} Lite connected`)
    }
    if (connection === 'close') {
      connected = false
      if (mainSocket === socket) mainSocket = null
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
      const loggedOut = statusCode === DisconnectReason.loggedOut
      logger.warn({ statusCode, loggedOut }, 'Termux Lite WhatsApp connection closed')
      if (loggedOut) {
        logger.error('Session logged out; run `ghostnexora pair <number>` to link again')
        return
      }
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          void connect().catch((error) => logger.error({ error }, 'Termux Lite reconnect failed'))
        }, 3000)
      }
    }
  })
}

await settings.init()
startTempCleanup()
startHealthServer()
startAutomationScheduler(() => mainSocket)
await subbotManager.startActive()
await connect()

logger.info({
  profile: config.runtimeProfile,
  commands: termuxLiteCommands.length,
  llm: false,
  ollama: false,
  webPanel: false,
  browserProxy: false,
  telegramBridge: false,
}, 'Ghost Nexora Bot Termux Lite started')

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))
process.on('unhandledRejection', (error) => logger.error({ error }, 'unhandled rejection'))
process.on('uncaughtException', (error) => logger.fatal({ error }, 'uncaught exception'))
