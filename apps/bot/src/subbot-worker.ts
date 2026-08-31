import { fork } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { DisconnectReason, type WAMessage, type WASocket } from 'baileys'
import { config } from './config.js'
import { CommandRouter } from './core/router.js'
import { settings } from './core/settings.js'
import { commands } from './commands/index.js'
import { economy } from './services/economy.js'
import { community } from './services/community.js'
import { subbotCustomization } from './services/subbot-customization.js'
import { handleParticipantUpdateV2, moderateIncomingV2 } from './services/moderation-v2.js'
import { observeMessageIdentity, resolveStoredIdentity } from './services/identity.js'
import { handleKickSticker } from './services/human-stickers.js'
import { maybeHumanInteraction } from './services/human-behavior-v8.js'
import { startTempCleanup } from './services/temp-cleanup.js'
import { observeGroupActivity } from './services/progression-v4.js'
import { autoChat } from './services/auto-chat.js'
import { getMessageText, getSender } from './utils/message.js'
import { withTimeout } from './utils/timeout.js'
import { logger } from './utils/logger.js'
import { groupControlsV9 } from './services/group-controls-v9.js'
import { handleAntiViewOnce } from './services/group-controls-v9.js'

const ROLE = process.env.NEXORA_INSTANCE_ROLE ?? 'main'
if (ROLE !== 'subbot') {
  throw new Error('subbot-worker.js debe ejecutarse con NEXORA_INSTANCE_ROLE=subbot')
}

const subbotId = Number(process.env.NEXORA_SUBBOT_ID ?? 0)
const ownerJid = String(process.env.NEXORA_SUBBOT_OWNER_JID ?? '')
const expiresAt = Number(process.env.NEXORA_SUBBOT_EXPIRES_AT ?? 0)
const initialPhone = process.env.NEXORA_SUBBOT_PHONE || null

if (!Number.isInteger(subbotId) || subbotId <= 0) throw new Error('NEXORA_SUBBOT_ID inválido')
if (!ownerJid) throw new Error('NEXORA_SUBBOT_OWNER_JID requerido')

function sendParent(message: Record<string, unknown>) {
  try { process.send?.(message) } catch {}
}

// The isolated process has its own SQLite/settings/cache directory. LLM is hard-disabled
// in the child process even when the host .env enables it for the main bot.
const localRecord = economy.listSubbots().find((row) => row.id === subbotId)
if (!localRecord) {
  economy.db.prepare(`
    INSERT INTO subbots(id, owner_jid, phone, status, expires_at, created_at, last_seen_at, messages_processed, download_bytes)
    VALUES(?, ?, ?, 'pending', ?, ?, ?, 0, 0)
  `).run(subbotId, ownerJid, initialPhone, expiresAt || Date.now() + 365 * 24 * 60 * 60_000, Date.now(), Date.now())
}
subbotCustomization.get(subbotId)

const allowedCommands = commands.filter((command) => {
  const blockedNames = new Set([
    'llm', 'minillm', 'localai', 'corpus', 'llmcorpus',
    'subbot', 'jadibot', 'serbot', 'subbots', 'subbotlist', 'jadibots',
    'adminpanel', 'dashboard',
  ])
  return !blockedNames.has(command.name.toLowerCase()) && !command.ownerOnly && command.category !== 'owner'
})

const router = new CommandRouter(allowedCommands, {
  instanceId: subbotId,
  instanceOwnerJid: ownerJid,
})

let socket: WASocket | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let reconnectAttempts = 0
let stopping = false

function status(status: string, extra: Record<string, unknown> = {}) {
  sendParent({ type: 'status', subbotId, status, ...extra })
}

function scheduleReconnect() {
  if (stopping || reconnectTimer) return
  if (Date.now() >= expiresAt) {
    status('expired')
    return
  }
  reconnectAttempts += 1
  if (reconnectAttempts > 12) {
    status('offline', { reason: 'reconnect_limit' })
    return
  }
  const delay = Math.min(30_000, reconnectAttempts <= 2 ? 1500 : 3000 * reconnectAttempts)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void start().catch((error) => logger.error({ error, subbotId }, 'isolated subbot reconnect failed'))
  }, delay)
}

async function routeMessage(message: WAMessage) {
  if (!socket) return
  const chatId = message.key.remoteJid
  if (!chatId || chatId === 'status@broadcast' || !message.message) return
  await observeMessageIdentity(socket, message).catch(() => undefined)

  const text = getMessageText(message).trim()
  const pushName = message.pushName ?? 'Usuario'

  if (!message.key.fromMe) {
    observeGroupActivity(
      chatId,
      resolveStoredIdentity(getSender(message)),
      chatId.endsWith('@g.us'),
      text.startsWith(settings.prefix),
    )
  }

  if (await handleAntiViewOnce(socket, message).catch(() => false)) return
  if (await handleKickSticker(socket, message).catch(() => false)) return
  if (await moderateIncomingV2(socket, message)) return

  const handled = await router.handle(socket, message)
  if (handled) return

  if (chatId && text.length >= 2 && !text.startsWith(settings.prefix) && autoChat.isEnabled(chatId) && autoChat.canRespond(chatId)) {
    try {
      const response = await autoChat.respond(chatId, text)
      if (!response) return
      await socket.sendPresenceUpdate('composing', chatId).catch(() => undefined)
      await socket.sendMessage(chatId, { text: response }, { quoted: message })
      await socket.sendPresenceUpdate('paused', chatId).catch(() => undefined)
    } catch (error) {
      logger.warn({ error, chatId, subbotId }, 'isolated subbot auto-chat failed')
    }
  }

  if (chatId?.endsWith('@g.us') && groupControlsV9.get(chatId).restrictedMode) return
  await maybeHumanInteraction(socket, message).catch(() => false)
}

async function start() {
  if (stopping || Date.now() >= expiresAt) {
    status('expired')
    return
  }

  const { socket: created } = await import('./core/session.js').then((module) => module.createSocket(config.sessionDir))
  socket = created

  socket.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return
    for (const message of messages) {
      void withTimeout(routeMessage(message), 120_000, `isolated-subbot route #${subbotId}`)
        .catch((error) => logger.error({ error, subbotId }, 'isolated subbot message failed'))
    }
  })

  socket.ev.on('group-participants.update', (update) => {
    void handleParticipantUpdateV2(socket!, update, subbotId).catch((error) =>
      logger.error({ error, subbotId, groupId: update.id }, 'isolated subbot participant update failed'),
    )
  })

  socket.ev.on('connection.update', ({ connection, lastDisconnect, qr, isNewLogin }) => {
    if (qr && !socket?.authState.creds.registered) status('pairing', { qr })
    if (isNewLogin) status('pairing')

    if (connection === 'open') {
      reconnectAttempts = 0
      const phone = socket?.user?.id?.split(':')[0]?.split('@')[0] ?? initialPhone
      economy.db.prepare('UPDATE subbots SET status = ?, phone = ?, last_seen_at = ? WHERE id = ?')
        .run('online', phone ?? null, Date.now(), subbotId)
      status('online', { jid: socket?.user?.id ?? null, phone: phone ?? null })
      return
    }

    if (connection !== 'close') return

    socket = null
    const code = Number((lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode ?? 0)
    const linked = Boolean(created.authState.creds.registered)
    if (code === DisconnectReason.loggedOut) {
      economy.db.prepare('UPDATE subbots SET status = ?, last_seen_at = ? WHERE id = ?').run('logged_out', Date.now(), subbotId)
      status('logged_out', { statusCode: code })
      return
    }

    economy.db.prepare('UPDATE subbots SET status = ?, last_seen_at = ? WHERE id = ?')
      .run(linked ? 'offline' : 'pending', Date.now(), subbotId)
    status(linked ? 'offline' : 'pending', { statusCode: code })
    scheduleReconnect()
  })

  status(socket.authState.creds.registered ? 'starting' : 'pairing')
}

async function requestPairingCode() {
  if (!socket) await start()
  if (!socket) throw new Error('Subbot socket no disponible.')
  const phone = initialPhone ?? process.env.NEXORA_SUBBOT_PHONE
  if (!phone) throw new Error('No hay teléfono para solicitar código de vinculación.')
  await new Promise((resolve) => setTimeout(resolve, 2000))
  if (socket.authState.creds.registered) return null
  const code = await withTimeout(socket.requestPairingCode(phone), 25_000, `subbot pairing #${subbotId}`)
  return code?.trim() || null
}

async function requestQr() {
  if (!socket) await start()
  if (!socket) throw new Error('Subbot socket no disponible.')
  if (socket.authState.creds.registered) return null
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket?.ev.off('connection.update', listener as never)
      reject(new Error('WhatsApp no generó un QR a tiempo.'))
    }, 55_000)
    const listener = ({ qr, connection }: { qr?: string; connection?: string }) => {
      if (qr) {
        clearTimeout(timeout)
        socket?.ev.off('connection.update', listener as never)
        resolve(qr)
        return
      }
      if (connection === 'open') {
        clearTimeout(timeout)
        socket?.ev.off('connection.update', listener as never)
        resolve('')
      }
    }
    socket!.ev.on('connection.update', listener as never)
  })
}

process.on('message', (message: unknown) => {
  if (!message || typeof message !== 'object') return
  const value = message as Record<string, unknown>
  if (value.type === 'pair') {
    void requestPairingCode()
      .then((code) => sendParent({ type: 'pair-result', subbotId, ok: Boolean(code), code }))
      .catch((error) => sendParent({ type: 'pair-result', subbotId, ok: false, error: error instanceof Error ? error.message : String(error) }))
  }
  if (value.type === 'qr') {
    void requestQr()
      .then((qr) => sendParent({ type: 'qr-result', subbotId, ok: Boolean(qr), qr }))
      .catch((error) => sendParent({ type: 'qr-result', subbotId, ok: false, error: error instanceof Error ? error.message : String(error) }))
  }
  if (value.type === 'stop') {
    stopping = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    try { socket?.end(new Error('isolated subbot stop')) } catch {}
    process.exit(0)
  }
  if (value.type === 'customization' && typeof value.name === 'string') {
    void settings.setBotDisplayName(value.name)
  }
})

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

await settings.init()
await settings.setPrivateCommandsRequireAccess(true)
startTempCleanup()
await start()
