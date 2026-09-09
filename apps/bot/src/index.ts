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
import { executeAdminWebControl } from './services/admin-web-control.js'
import { installAtomicWalletBridge } from './services/wallet-atomic.js'
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
import { llmFreeChat } from './services/llm-free-chat.js'
import { sendAssistantReply } from './services/assistant-reply.js'
import { hasAudio, transcribeWhatsAppAudio } from './services/audio-transcribe.js'
import { runSubbotSessionRepairMigration } from './services/subbot-session-repair.js'
import { canProcessPrivateMessage } from './services/private-chat-policy.js'
import { getMessageText, getSender } from './utils/message.js'
import { logger } from './utils/logger.js'
import { withTimeout } from './utils/timeout.js'
import { groupControlsV9, handleAntiViewOnce } from './services/group-controls-v9.js'
import { startBrowserProxy } from './services/browser-proxy.js'

installAtomicWalletBridge()

const startedAt = new Date()
let connected = false
let connectedAt: Date | null = null
let activeJid: string | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let reconnectAttempts = 0
let mainSocket: WASocket | null = null
let socketGeneration = 0

function mainSocketConnected() {
  return Boolean(mainSocket && mainSocket.authState.creds.registered && mainSocket.user?.id)
}

function effectiveMainConnected() {
  return connected || mainSocketConnected()
}

function markMainSocketLive(socket: WASocket) {
  if (mainSocket !== socket || !socket.authState.creds.registered) return
  connected = true
  activeJid = socket.user?.id ?? activeJid
  if (!connectedAt) connectedAt = new Date()
}

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
  return executeAdminWebControl(body, effectiveMainConnected() ? mainSocket : null)
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
    const live = effectiveMainConnected()
    json(res, live ? 200 : 503, {
      ok: live,
      service: 'ghost-nexora-bot',
      botName: config.botName,
      prefix: settings.prefix,
      connected: live,
      connectedAt: connectedAt?.toISOString() ?? null,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      activeJid: mainSocket?.user?.id ?? activeJid,
      llm: {
        localEnabled: config.ollamaEnabled,
        model: config.ollamaEnabled ? config.ollamaModel : null,
      },
      subbots: {
        total: subbots.length,
        online: subbots.filter((item) => item.status === 'online').length,
        pending: subbots.filter((item) => item.status === 'pending').length,
        offline: subbots.filter((item) => item.status === 'offline').length,
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
  const chatId = message.key.remoteJid
  if (!chatId || !canProcessPrivateMessage(message)) return

  // El corte privado ocurre antes de identidad, moderación, stickers, IA, presencia,
  // reacciones y comandos. Un privado no autorizado no genera ninguna salida.
  await observeMessageIdentity(socket, message).catch((error) => logger.debug({ error }, 'identity observation skipped'))

  const text = getMessageText(message).trim()
  const pushName = (message as { pushName?: string }).pushName || 'Usuario'

  if (!message.key.fromMe) {
    observeGroupActivity(
      chatId,
      resolveStoredIdentity(getSender(message)),
      chatId.endsWith('@g.us'),
      text.startsWith(settings.prefix),
    )
    if (config.ollamaEnabled && text.length >= 2 && !text.startsWith(settings.prefix)) {
      llmFreeChat.rememberIncoming(chatId, text, pushName)
    }
  }

  if (await handleAntiViewOnce(socket, message).catch((error) => {
    logger.warn({ error, chatId }, 'anti view-once handler failed')
    return false
  })) return

  if (await handleKickSticker(socket, message).catch((error) => {
    logger.warn({ error, chatId }, 'kick sticker handler failed; continuing route')
    return false
  })) return

  if (await moderateIncomingV2(socket, message).catch((error) => {
    logger.warn({ error, chatId }, 'moderation failed; continuing command route')
    return false
  })) return

  const handled = await router.handle(socket, message)
  if (handled) return

  if (
    config.ollamaEnabled &&
    !message.key.fromMe &&
    hasAudio(message) &&
    llmFreeChat.isEnabled(chatId) &&
    llmFreeChat.isGroupAllowed(chatId) &&
    llmFreeChat.canRespond(chatId)
  ) {
    const state = llmFreeChat.getState()
    if (state.requireMention && chatId.endsWith('@g.us')) {
      // No responder audios de grupo sin mención cuando esa política está activa.
    } else {
      const stopTyping = startTypingIndicator(socket, chatId)
      try {
        await socket.sendMessage(chatId, { react: { text: '🎧', key: message.key } }).catch(() => undefined)
        const transcript = await transcribeWhatsAppAudio(message, false)
        if (transcript.trim().length >= 2) {
          llmFreeChat.commitRespond(chatId)
          const response = await llmFreeChat.respond(transcript, chatId, pushName)
          if (response) {
            await sendAssistantReply(socket, chatId, response, {
              userPrompt: transcript,
              title: 'Ghost Nexora',
              quoted: message,
            })
            await llmFreeChat.maybeReact(socket, message, transcript, response)
          }
        }
      } catch (error) {
        logger.warn({ error, chatId }, 'audio free-chat failed')
      } finally {
        stopTyping()
      }
      return
    }
  }

  if (
    config.ollamaEnabled &&
    llmFreeChat.shouldHandle({ chatId, text, prefix: settings.prefix, message, socket })
  ) {
    const stopTyping = startTypingIndicator(socket, chatId)
    try {
      const response = await llmFreeChat.respond(text, chatId, pushName)
      if (!response) return
      llmFreeChat.commitRespond(chatId)
      await sendAssistantReply(socket, chatId, response, {
        userPrompt: text,
        title: 'Ghost Nexora',
        quoted: message,
      })
      await llmFreeChat.maybeReact(socket, message, text, response)
    } catch (error) {
      logger.warn({ error, chatId }, 'llm free-chat response failed')
    } finally {
      stopTyping()
    }
    return
  }

  if (
    config.ollamaEnabled &&
    text.length >= 2 &&
    !text.startsWith(settings.prefix) &&
    autoChat.isEnabled(chatId) &&
    autoChat.canRespond(chatId)
  ) {
    try {
      const response = await autoChat.respond(chatId, text)
      if (!response) return
      await socket.sendPresenceUpdate('composing', chatId).catch(() => undefined)
      await sendAssistantReply(socket, chatId, response, {
        userPrompt: text,
        title: 'Ghost Nexora · Chat',
        quoted: message,
      })
      await socket.sendPresenceUpdate('paused', chatId).catch(() => undefined)
    } catch (error) {
      logger.warn({ error, chatId }, 'auto-chat response failed')
    }
    return
  }

  if (chatId.endsWith('@g.us') && groupControlsV9.get(chatId).restrictedMode) return
  await maybeHumanInteraction(socket, message).catch(() => false)
}

function scheduleMainReconnect(reason: string) {
  if (reconnectTimer) return
  reconnectAttempts += 1
  const exponent = Math.min(5, Math.max(0, reconnectAttempts - 1))
  const delay = Math.min(60_000, 2000 * (2 ** exponent)) + Math.floor(Math.random() * 1000)
  logger.warn({ reconnectAttempts, delay, reason }, 'main WhatsApp reconnect scheduled')

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void connect().catch((error) => {
      logger.error({ error, reconnectAttempts }, 'main WhatsApp reconnect failed')
      scheduleMainReconnect('connect_failed')
    })
  }, delay)
  reconnectTimer.unref?.()
}

async function connect() {
  const generation = ++socketGeneration
  const { socket } = await createSocket()
  if (generation !== socketGeneration) {
    try { socket.end(new Error('stale main socket generation')) } catch {}
    return
  }
  mainSocket = socket
  const router = new CommandRouter(commands)

  socket.ev.on('messages.upsert', ({ messages, type }) => {
    if (generation !== socketGeneration || type !== 'notify') return
    markMainSocketLive(socket)
    for (const message of messages) {
      if (!message.message || !message.key.remoteJid || message.key.remoteJid === 'status@broadcast') continue
      const chatId = message.key.remoteJid
      void withTimeout(routeMessage(socket, message, router), config.botMessageTimeoutMs, 'routeMessage ' + chatId)
        .catch((error) => logger.error({ error, chatId }, 'mensaje colgado o falló'))
    }
  })

  socket.ev.on('group-participants.update', (update) => {
    if (generation !== socketGeneration) return
    markMainSocketLive(socket)
    void handleParticipantUpdateV2(socket, update).catch((error) =>
      logger.error({ error, groupId: update.id, action: update.action }, 'participant update failed'))
  })

  socket.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (generation !== socketGeneration) return
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
      reconnectAttempts = 0
      logger.info({ jid: activeJid, prefix: settings.prefix, generation }, config.botName + ' connected')
    }
    if (connection === 'close') {
      connected = false
      if (mainSocket === socket) mainSocket = null
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
      const loggedOut = statusCode === DisconnectReason.loggedOut
      logger.warn({ statusCode, loggedOut, generation }, 'WhatsApp connection closed')
      if (loggedOut) {
        logger.error('session logged out; run `npm run pair` to link again')
        return
      }
      scheduleMainReconnect(`connection_close:${statusCode ?? 'unknown'}`)
    }
  })
}

await settings.init()

const subbotRepair = runSubbotSessionRepairMigration()
if (subbotRepair.ran) {
  logger.warn({ reset: subbotRepair.reset }, 'subbot repair migration completed; affected users must pair again')
}

startTempCleanup()
startHealthServer()
startBrowserProxy()
startAutomationScheduler(() => mainSocket)
void startTelegramBridge().then((enabled) => {
  if (enabled) logger.info('Telegram bridge started')
}).catch((error) => logger.warn({ error }, 'Telegram bridge not started'))

if (config.ollamaEnabled) {
  logger.info({ model: config.ollamaModel }, 'local LLM commands and free-chat enabled')
} else {
  logger.info('local LLM disabled; Ollama/LLM/free-chat commands are not registered')
}

await subbotManager.startActive()
await connect().catch((error) => {
  logger.error({ error }, 'initial WhatsApp connection failed')
  scheduleMainReconnect('initial_connect_failed')
})

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))
process.on('unhandledRejection', (error) => logger.error({ error }, 'unhandled rejection'))
process.on('uncaughtException', (error) => logger.fatal({ error }, 'uncaught exception'))
