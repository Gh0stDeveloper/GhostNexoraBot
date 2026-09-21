import { mkdir } from 'node:fs/promises'
import makeWASocket, {
  Browsers,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
} from 'baileys'
import { config } from '../config.js'
import { registerOpsSocket } from '../services/group-ops-runtime.js'
import { performanceAudit } from '../services/performance-audit.js'
import { canSendToChatJid } from '../services/private-chat-policy.js'
import { startRuntimeDiagnostics } from '../services/runtime-diagnostics.js'
import { registerSecurityPocSocket } from '../services/security-poc-scope.js'
import { silentWaLogger } from '../utils/logger.js'
import { isWhatsAppRateOverlimit, noteWhatsAppRateOverlimit } from '../services/whatsapp-rate-limit.js'

export async function createSocket(sessionDir = config.sessionDir): Promise<{ socket: WASocket; saveCreds: () => Promise<void> }> {
  await mkdir(sessionDir, { recursive: true })
  startRuntimeDiagnostics()
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
  const { version } = await fetchLatestBaileysVersion()
  const socket = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, silentWaLogger) },
    logger: silentWaLogger,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
    getMessage: async () => undefined,
  })

  // Los recibos de lectura se gestionan en la capa de sesión para que funcionen
  // igual en MainBot, subbots y Termux. Solo se marcan como vistos los mensajes
  // entrantes de grupos; los mensajes propios, estados y chats privados no se tocan.
  socket.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return
    const keys = messages
      .filter((message) => !message.key.fromMe && Boolean(message.key.id) && message.key.remoteJid?.endsWith('@g.us'))
      .map((message) => message.key)
    if (!keys.length) return
    void socket.readMessages(keys).catch(() => undefined)
  })

  // Firewall de salida: ninguna ruta interna, actual o futura, puede escribir a un
  // chat privado no autorizado saltándose el router. En subbots el owner válido
  // es exclusivamente NEXORA_SUBBOT_OWNER_JID; en MainBot se usan OWNER_NUMBERS.
  const rawSendMessage = socket.sendMessage.bind(socket)
  socket.sendMessage = (async (jid, content, options) => {
    const instanceOwnerJid = process.env.NEXORA_SUBBOT_OWNER_JID || undefined
    if (!canSendToChatJid(jid, instanceOwnerJid)) return undefined
    const started = performance.now()
    try {
      return await rawSendMessage(jid, content, options)
    } catch (error) {
      if (isWhatsAppRateOverlimit(error)) {
        noteWhatsAppRateOverlimit(socket.user?.id ?? sessionDir, 'sendMessage', error)
      }
      throw error
    } finally {
      performanceAudit.recordStage('07', performance.now() - started)
    }
  }) as WASocket['sendMessage']

  registerOpsSocket(socket)
  registerSecurityPocSocket(socket)
  socket.ev.on('creds.update', saveCreds)
  return { socket, saveCreds }
}
