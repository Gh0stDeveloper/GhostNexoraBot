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
import { handleKickSticker } from './services/human-stickers.js'
import { maybeHumanInteraction } from './services/human-behavior-v8.js'
import { startTempCleanup } from './services/temp-cleanup.js'
import { observeGroupActivity } from './services/progression-v4.js'
import { startAutomationScheduler } from './services/automation-v4.js'
import { handleV4Api } from './services/api-v4.js'
import { startTelegramBridge } from './services/telegram-bridge-v7.js'
import { autoChat } from './services/auto-chat.js'
import { llmFreeChat, shouldLearnText } from './services/llm-free-chat.js'
import { enqueueLiveMessage } from './llm/live-queue.js'
import { getMessageText, getSender } from './utils/message.js'
import { logger } from './utils/logger.js'
import { withTimeout } from './utils/timeout.js'
import { groupControlsV9, handleAntiViewOnce } from './services/group-controls-v9.js'

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

async function executeControl(body: Record<string, unknown>) {
  const action = String(body.action ?? '')
  if (action === 'economy-sync') {
    return { ok: true, result: { top: economyV2.globalTop(10) } }
  }
  return { ok: false, error: 'unknown_action' }
}

function startHealthServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/control') {
      const auth = req.headers.authorization ?? ''
      if (!config.adminWebToken || auth !== `Bearer ${config.adminWebToken}`) {
        json(res, 401, { ok: false, error: 'unauthorized' })
        return
      }
      try {
        json(res, 200, await executeControl(await readJson(req)))
      } catch (error) {
        logger.warn({ error }, 'admin control request failed')
        json(res, 400, { ok: false, error: error instanceof Error ? error.message : 'control_failed' })
      }
      return
    }
    if (req.url?.startsWith('/api/v1/')) {
      try {
        const handled = await handleV4Api(req, res)
        if (handled) return
      } catch (error) {
        logger.warn({ error }, 'api v4 failed')
        json(res, 500, { ok: false, error: 'api_v4_failed' })
        return
      }
    }
    if (req.url !== '/health') {
      json(res, 404, { ok: false, error: 'not_found' })
      return
    }
    const subbots = economy.listSubbots()
    json(res, connected ? 200 : 503, {
      ok: connected,
      service: 'ghost-nexora-bot',
      botName: config.botName,
      prefix: settings.prefix,
      connected,
      connectedAt: connectedAt?.toISOString() ?? null,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      activeJid,
      subbots: {
        total: subbots.length,
        online: subbots.filter((item) => item.status === 'online').length,
      },
    })
  })
  server.listen(config.healthPort, '127.0.0.1', () => logger.info({ port: config.healthPort }, 'health/control/api server listening'))
}

function startTypingIndicator(socket: WASocket, chatId: string) {
  void socket.sendPresenceUpdate('composing', chatId).catch(() => undefined)
  const timer = setInterval(() => {
    void socket.sendPresenceUpdate('composing', chatId).catch(() => undefined)
  }, 4500)
  timer.unref?.()
  return () => {
    clearInterval(timer)
    void socket.sendPresenceUpdate('paused', chatId).catch(() => undefined)
  }
}

async function routeMessage(
  socket: Awaited<ReturnType<typeof createSocket>>['socket'],
  message: Parameters<CommandRouter['handle']>[1],
  router: CommandRouter,
) {
  await observeMessageIdentity(socket, message).catch((error) => logger.debug({ error }, 'identity observation skipped'))

  const chatId = message.key.remoteJid
  const text = getMessageText(message).trim()
  const pushName = (message as { pushName?: string }).pushName || 'Usuario'

  if (chatId && !message.key.fromMe) {
    observeGroupActivity(
      chatId,
      resolveStoredIdentity(getSender(message)),
      chatId.endsWith('@g.us'),
      text.startsWith(settings.prefix),
    )
    if (text.length >= 2 && !text.startsWith(settings.prefix) && shouldLearnText(text)) enqueueLiveMessage(text)
    // Memoria de hilo aunque no se mencione al bot (contexto de grupo)
    if (text.length >= 2 && !text.startsWith(settings.prefix)) {
      llmFreeChat.rememberIncoming(chatId, text, pushName)
    }
  }

  if (await handleAntiViewOnce(socket, message).catch((error) => {
    logger.warn({ error, chatId }, 'anti view-once handler failed')
    return false
  })) {
    return
  }

  if (await handleKickSticker(socket, message).catch(() => false)) return
  if (await moderateIncomingV2(socket, message)) return

  const handled = await router.handle(socket, message)
  if (handled) return

  if (chatId && llmFreeChat.shouldHandle({ chatId, text, prefix: settings.prefix, message, socket })) {
    const stopTyping = startTypingIndicator(socket, chatId)
    try {
      const response = await llmFreeChat.respond(text, chatId, pushName)
      if (!response) return
      llmFreeChat.commitRespond(chatId)
      await socket.sendMessage(chatId, { text: response }, { quoted: message })
      await llmFreeChat.maybeReact(socket, message, text, response)
    } catch (error) {
      logger.warn({ error, chatId }, 'llm free-chat response failed')
    } finally {
      stopTyping()
    }
    return
  }

  if (chatId && text.length >= 2 && !text.startsWith(settings.prefix) && autoChat.isEnabled(chatId) && autoChat.canRespond(chatId)) {
    try {
      const response = await autoChat.respond(chatId, text)
      if (!response) return
      await socket.sendPresenceUpdate('composing', chatId).catch(() => undefined)
      await socket.sendMessage(chatId, { text: response }, { quoted: message })
      await socket.sendPresenceUpdate('paused', chatId).catch(() => undefined)
    } catch (error) {
      logger.warn({ error, chatId }, 'auto-chat response failed')
    }
    return
  }

  if (chatId?.endsWith('@g.us') && groupControlsV9.get(chatId).restrictedMode) return
  await maybeHumanInteraction(socket, message).catch(() => false)
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
      void withTimeout(routeMessage(socket, message, router), 120_000, `routeMessage ${chatId}`)
        .catch((error) => logger.error({ error, chatId }, 'mensaje colgado o falló'))
    }
  })

  socket.ev.on('group-participants.update', (update) => {
    void handleParticipantUpdateV2(socket, update).catch((error) =>
      logger.error({ error, groupId: update.id, action: update.action }, 'participant update failed'))
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
      mainSocket = socket
      logger.info({ jid: activeJid, prefix: settings.prefix }, `${config.botName} connected`)
    }
    if (connection === 'close') {
      connected = false
      if (mainSocket === socket) mainSocket = null
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
startAutomationScheduler(() => mainSocket)
void startTelegramBridge().then((enabled) => {
  if (enabled) logger.info('Telegram bridge started')
}).catch((error) => logger.warn({ error }, 'Telegram bridge not started'))

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
