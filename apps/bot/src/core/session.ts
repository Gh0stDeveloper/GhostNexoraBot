import { mkdir } from 'node:fs/promises'
import makeWASocket, {
  Browsers,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
} from 'baileys'
import { config } from '../config.js'
import { canSendToChatJid } from '../services/private-chat-policy.js'
import { silentWaLogger } from '../utils/logger.js'

export async function createSocket(sessionDir = config.sessionDir): Promise<{ socket: WASocket; saveCreds: () => Promise<void> }> {
  await mkdir(sessionDir, { recursive: true })
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

  // Firewall de salida: ninguna ruta interna, actual o futura, puede escribir a un
  // chat privado no autorizado saltándose el router. En subbots el owner válido
  // es exclusivamente NEXORA_SUBBOT_OWNER_JID; en MainBot se usan OWNER_NUMBERS.
  const rawSendMessage = socket.sendMessage.bind(socket)
  socket.sendMessage = (async (jid, content, options) => {
    const instanceOwnerJid = process.env.NEXORA_SUBBOT_OWNER_JID || undefined
    if (!canSendToChatJid(jid, instanceOwnerJid)) return undefined
    return rawSendMessage(jid, content, options)
  }) as WASocket['sendMessage']

  socket.ev.on('creds.update', saveCreds)
  return { socket, saveCreds }
}
