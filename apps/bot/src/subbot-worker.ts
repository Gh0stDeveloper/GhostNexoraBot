import { DisconnectReason, type WAMessage, type WASocket } from 'baileys'
import { config } from './config.js'
import { CommandRouter } from './core/router.js'
import { settings } from './core/settings.js'
import { commands } from './commands/index.js'
import { economy } from './services/economy.js'
import { installSharedEntitlementBridge } from './services/entitlement-bridge.js'
import { installAtomicWalletBridge } from './services/wallet-atomic.js'
import { subbotCustomization } from './services/subbot-customization.js'
import { handleParticipantUpdateV2, moderateIncomingV2 } from './services/moderation-v2.js'
import { observeMessageIdentity, resolveStoredIdentity } from './services/identity.js'
import { handleKickSticker } from './services/human-stickers.js'
import { maybeHumanInteraction } from './services/human-behavior-v8.js'
import { startTempCleanup } from './services/temp-cleanup.js'
import { observeGroupActivity } from './services/progression-v4.js'
import { canProcessPrivateMessage } from './services/private-chat-policy.js'
import { getMessageText, getSender } from './utils/message.js'
import { withTimeout } from './utils/timeout.js'
import { logger } from './utils/logger.js'
import { groupControlsV9, handleAntiViewOnce } from './services/group-controls-v9.js'

if (process.env.NEXORA_INSTANCE_ROLE !== 'subbot') throw new Error('subbot-worker.js requiere NEXORA_INSTANCE_ROLE=subbot')

const subbotId = Number(process.env.NEXORA_SUBBOT_ID ?? 0)
const ownerJid = String(process.env.NEXORA_SUBBOT_OWNER_JID ?? '')
const expiresAt = Number(process.env.NEXORA_SUBBOT_EXPIRES_AT ?? 0)
let phone = process.env.NEXORA_SUBBOT_PHONE || null

if (!Number.isInteger(subbotId) || subbotId <= 0) throw new Error('NEXORA_SUBBOT_ID inválido')
if (!ownerJid) throw new Error('NEXORA_SUBBOT_OWNER_JID requerido')

const sharedEntitlements = installSharedEntitlementBridge()
installAtomicWalletBridge()
if (sharedEntitlements) logger.info({ subbotId }, 'subbot using MainBot entitlement database')

function sendParent(message: Record<string, unknown>) {
  try { process.send?.(message) } catch {}
}

const existing = economy.listSubbots().find((row) => row.id === subbotId)
if (!existing) {
  economy.db.prepare(`
    INSERT INTO subbots(id, owner_jid, phone, status, expires_at, created_at, last_seen_at, messages_processed, download_bytes)
    VALUES(?, ?, ?, 'pending', ?, ?, ?, 0, 0)
  `).run(subbotId, ownerJid, phone, expiresAt || Date.now() + 365 * 24 * 60 * 60_000, Date.now(), Date.now())
}

const customization = subbotCustomization.get(subbotId)
if (process.env.NEXORA_SUBBOT_NAME) {
  subbotCustomization.setNames(subbotId, process.env.NEXORA_SUBBOT_SHORT_NAME || customization.shortName, process.env.NEXORA_SUBBOT_NAME)
}

const blockedNames = new Set([
  'llm', 'minillm', 'localai', 'corpus', 'llmcorpus',
  'subbot', 'jadibot', 'serbot', 'subbots', 'subbotlist', 'jadibots',
  'adminpanel', 'dashboard',
])
const allowedCommands = commands.filter((command) =>
  !blockedNames.has(command.name.toLowerCase()) &&
  command.category !== 'subbots' &&
  !command.ownerOnly &&
  (command.category !== 'owner' || command.subbotOwnerAllowed === true),
)

const router = new CommandRouter(allowedCommands, { instanceId: subbotId, instanceOwnerJid: ownerJid })

let socket: WASocket | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let reconnectAttempts = 0
let stopping = false
let latestQr: { value: string; createdAt: number } | null = null
let connectionState = 'starting'

function report(status: string, extra: Record<string, unknown> = {}) {
  connectionState = status
  sendParent({ type: 'status', subbotId, status, ...extra })
}

function scheduleReconnect() {
  if (stopping || reconnectTimer) return
  if (Date.now() >= expiresAt) {
    report('expired')
    return
  }

  reconnectAttempts += 1
  const exponent = Math.min(5, Math.max(0, reconnectAttempts - 1))
  const base = Math.min(60_000, 1500 * (2 ** exponent))
  const jitter = Math.floor(Math.random() * 1250)
  const delay = base + jitter
  report('offline', { reconnectAttempt: reconnectAttempts, retryInMs: delay })

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void start().catch((error) => {
      logger.error({ error, subbotId, reconnectAttempts }, 'isolated subbot reconnect failed')
      scheduleReconnect()
    })
  }, delay)
  reconnectTimer.unref?.()
}

async function routeMessage(message: WAMessage) {
  if (!socket) return
  const chatId = message.key.remoteJid
  if (!chatId || chatId === 'status@broadcast' || !message.message) return
  if (!canProcessPrivateMessage(message, ownerJid)) return

  await observeMessageIdentity(socket, message).catch(() => undefined)
  const text = getMessageText(message).trim()

  if (!message.key.fromMe) {
    observeGroupActivity(chatId, resolveStoredIdentity(getSender(message)), chatId.endsWith('@g.us'), text.startsWith(settings.prefix))
  }

  if (await handleAntiViewOnce(socket, message).catch((error) => {
    logger.warn({ error, subbotId, chatId }, 'anti-view-once failed; continuing message route')
    return false
  })) return
  if (await handleKickSticker(socket, message).catch((error) => {
    logger.warn({ error, subbotId, chatId }, 'kick-sticker handler failed; continuing message route')
    return false
  })) return
  if (await moderateIncomingV2(socket, message).catch((error) => {
    logger.warn({ error, subbotId, chatId }, 'subbot moderation failed; continuing message route')
    return false
  })) return

  const handled = await router.handle(socket, message)
  if (handled) return
  if (chatId.endsWith('@g.us') && groupControlsV9.get(chatId).restrictedMode) return
  await maybeHumanInteraction(socket, message).catch(() => false)
}

async function start() {
  if (stopping || Date.now() >= expiresAt) {
    report('expired')
    return
  }
  latestQr = null
  connectionState = 'starting'
  const { createSocket } = await import('./core/session.js')
  const { socket: created } = await createSocket(config.sessionDir)
  socket = created

  socket.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return
    for (const message of messages) {
      void withTimeout(routeMessage(message), config.botMessageTimeoutMs, `isolated-subbot route #${subbotId}`)
        .catch((error) => logger.error({ error, subbotId }, 'isolated subbot message failed'))
    }
  })

  socket.ev.on('group-participants.update', (update) => {
    void handleParticipantUpdateV2(socket!, update, subbotId).catch((error) =>
      logger.error({ error, subbotId, groupId: update.id }, 'isolated subbot participant update failed'),
    )
  })

  socket.ev.on('connection.update', ({ connection, lastDisconnect, qr, isNewLogin }) => {
    if (qr && !socket?.authState.creds.registered) {
      latestQr = { value: qr, createdAt: Date.now() }
      report('pairing', { qr })
    }
    if (isNewLogin) report('pairing')

    if (connection === 'open') {
      reconnectAttempts = 0
      latestQr = null
      phone = socket?.user?.id?.split(':')[0]?.split('@')[0] ?? phone
      economy.db.prepare('UPDATE subbots SET status = ?, phone = ?, last_seen_at = ? WHERE id = ?')
        .run('online', phone, Date.now(), subbotId)
      report('online', { jid: socket?.user?.id ?? null, phone })
      return
    }

    if (connection !== 'close') return
    socket = null
    const code = Number((lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode ?? 0)
    const linked = Boolean(created.authState.creds.registered)
    if (code === DisconnectReason.loggedOut) {
      economy.db.prepare('UPDATE subbots SET status = ?, last_seen_at = ? WHERE id = ?').run('logged_out', Date.now(), subbotId)
      report('logged_out', { statusCode: code })
      return
    }

    economy.db.prepare('UPDATE subbots SET status = ?, last_seen_at = ? WHERE id = ?')
      .run(linked ? 'offline' : 'pending', Date.now(), subbotId)
    report(linked ? 'offline' : 'pending', { statusCode: code })
    scheduleReconnect()
  })

  report(created.authState.creds.registered ? 'starting' : 'pairing')
}

async function requestPairingCode() {
  if (!socket) await start()
  if (!socket) throw new Error('Subbot socket no disponible.')
  if (!phone) throw new Error('No hay teléfono para solicitar código de vinculación.')
  await new Promise((resolve) => setTimeout(resolve, 2000))
  if (socket.authState.creds.registered) return null
  const code = await withTimeout(socket.requestPairingCode(phone), 25_000, `subbot pairing #${subbotId}`)
  return code?.trim() || null
}

async function requestQr() {
  if (!socket) await start()
  if (!socket) throw new Error('Subbot socket no disponible.')
  if (socket.authState.creds.registered) return ''
  if (latestQr && Date.now() - latestQr.createdAt <= 50_000) return latestQr.value

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket?.ev.off('connection.update', listener as never)
      reject(new Error('WhatsApp no generó un QR a tiempo.'))
    }, 55_000)
    const listener = ({ qr, connection }: { qr?: string; connection?: string }) => {
      if (qr) {
        latestQr = { value: qr, createdAt: Date.now() }
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
      .then((code) => sendParent({ type: 'pair-result', subbotId, ok: true, code, alreadyLinked: code === null }))
      .catch((error) => sendParent({ type: 'pair-result', subbotId, ok: false, error: error instanceof Error ? error.message : String(error) }))
  }
  if (value.type === 'qr') {
    void requestQr()
      .then((qr) => sendParent({ type: 'qr-result', subbotId, ok: Boolean(qr), qr, alreadyLinked: qr === '' }))
      .catch((error) => sendParent({ type: 'qr-result', subbotId, ok: false, error: error instanceof Error ? error.message : String(error) }))
  }
  if (value.type === 'phone' && typeof value.value === 'string') {
    phone = value.value.replace(/\D/g, '') || null
    economy.db.prepare('UPDATE subbots SET phone = ?, status = ? WHERE id = ?').run(phone, phone ? 'pairing' : 'pending', subbotId)
  }
  if (value.type === 'customization' && typeof value.shortName === 'string' && typeof value.name === 'string') {
    subbotCustomization.setNames(subbotId, value.shortName, value.name)
    void settings.setBotDisplayName(value.name).catch(() => undefined)
  }
  if (value.type === 'stop') {
    stopping = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    try { socket?.end(new Error('isolated subbot stop')) } catch {}
    process.exit(0)
  }
})

const heartbeat = setInterval(() => {
  sendParent({
    type: 'heartbeat',
    subbotId,
    status: connectionState,
    registered: Boolean(socket?.authState.creds.registered),
    phone,
  })
}, 20_000)
heartbeat.unref?.()

process.on('disconnect', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

await settings.init()
startTempCleanup()
await start()
