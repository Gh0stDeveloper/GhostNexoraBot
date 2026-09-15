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
import { canProcessPrivateMessage } from './services/private-chat-policy.js'
import { getMessageText, getSender } from './utils/message.js'
import { logger } from './utils/logger.js'
import { withTimeout } from './utils/timeout.js'
import { groupControlsV9, handleAntiViewOnce } from './services/group-controls-v9.js'

if (!config.isTermuxLite) throw new Error('termux-lite.ts requiere NEXORA_RUNTIME_PROFILE=termux-lite')
process.title = 'ghost-nexora-termux-lite'

const startedAt = new Date()
const localWebEnabled = ['1', 'true', 'yes', 'on'].includes((process.env.TERMUX_LOCAL_WEB_ENABLED ?? 'false').toLowerCase())
let connected = false
let connectedAt: Date | null = null
let activeJid: string | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let mainSocket: WASocket | null = null

function json(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(payload))
}

function localWebPage() {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ghost Nexora Bot</title><style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#05060a;color:#f5f7fb}*{box-sizing:border-box}body{margin:0;padding:24px;background:radial-gradient(circle at top,#17142f 0,#05060a 44%);min-height:100vh}.wrap{max-width:760px;margin:auto}.tag{color:#b8aeff;font-size:12px;font-weight:800;letter-spacing:.12em}.card{background:#0d1017;border:1px solid #252c3a;border-radius:24px;padding:20px;margin-top:14px}.row{display:flex;justify-content:space-between;gap:14px;align-items:center}.muted{color:#8992a3}.ok{color:#53d39a}.off{color:#ff6b7a}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.metric{background:#131824;border-radius:16px;padding:14px}.metric b{display:block;margin-top:5px;font-size:18px}@media(max-width:520px){body{padding:14px}.grid{grid-template-columns:1fr}}</style></head>
<body><main class="wrap"><div class="tag">GHOST NEXORA / LOCAL</div><h1>Ghost Nexora Bot</h1><p class="muted">Panel local Lite. La aplicación Android sigue siendo el controlador principal.</p><section class="card"><div class="row"><div><b>Runtime</b><div class="muted" id="profile">termux-lite</div></div><strong id="state">Cargando…</strong></div><div class="grid" style="margin-top:16px"><div class="metric">WhatsApp<b id="wa">—</b></div><div class="metric">Tiempo activo<b id="uptime">—</b></div><div class="metric">Prefijo<b id="prefix">—</b></div><div class="metric">Subbots<b id="subbots">—</b></div></div></section></main><script>
const fmt=s=>{s=Number(s||0);const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?(h+'h '+m+'m'):(m+'m')};async function refresh(){try{const r=await fetch('/health',{cache:'no-store'});const x=await r.json();document.querySelector('#state').textContent=x.connected?'ONLINE':'INICIANDO';document.querySelector('#state').className=x.connected?'ok':'muted';document.querySelector('#wa').textContent=x.connected?'Conectado':'Sin conexión';document.querySelector('#uptime').textContent=fmt(x.uptimeSeconds);document.querySelector('#prefix').textContent=x.prefix||'.';document.querySelector('#subbots').textContent=((x.subbots?.online||0)+'/'+(x.subbots?.total||0));}catch{document.querySelector('#state').textContent='OFFLINE';document.querySelector('#state').className='off'}}refresh();setInterval(refresh,4000)</script></body></html>`
}

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/' && localWebEnabled) {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
      })
      res.end(localWebPage())
      return
    }
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
      web: localWebEnabled,
      subbots: {
        total: subbots.length,
        online: subbots.filter((item) => item.status === 'online').length,
      },
    })
  })
  server.listen(config.healthPort, '127.0.0.1', () => {
    logger.info({ port: config.healthPort, profile: config.runtimeProfile, localWebEnabled }, 'Termux Lite health server listening')
  })
}

async function routeMessage(
  socket: Awaited<ReturnType<typeof createSocket>>['socket'],
  message: Parameters<CommandRouter['handle']>[1],
  router: CommandRouter,
) {
  const chatId = message.key.remoteJid
  if (!chatId || !canProcessPrivateMessage(message)) return

  await observeMessageIdentity(socket, message).catch((error) => logger.debug({ error }, 'identity observation skipped'))
  const text = getMessageText(message).trim()

  if (!message.key.fromMe) {
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

  if (chatId.endsWith('@g.us') && groupControlsV9.get(chatId).restrictedMode) return
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
  webPanel: localWebEnabled,
  browserProxy: false,
  telegramBridge: false,
}, 'Ghost Nexora Bot Termux Lite started')

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))
process.on('unhandledRejection', (error) => logger.error({ error }, 'unhandled rejection'))
process.on('uncaughtException', (error) => logger.fatal({ error }, 'uncaught exception'))
