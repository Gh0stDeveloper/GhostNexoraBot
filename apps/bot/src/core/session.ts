import { mkdir } from 'node:fs/promises'
import makeWASocket, {
  Browsers,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
} from 'baileys'
import { config } from '../config.js'
import { silentWaLogger } from '../utils/logger.js'

export async function createSocket(): Promise<{ socket: WASocket; saveCreds: () => Promise<void> }> {
  await mkdir(config.sessionDir, { recursive: true })
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir)
  const { version } = await fetchLatestBaileysVersion()

  const socket = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silentWaLogger),
    },
    logger: silentWaLogger,
    // Pairing codes are stricter than QR pairing about browser descriptors.
    // Keep a canonical Ubuntu + Chrome tuple for maximum compatibility.
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
    getMessage: async () => undefined,
  })

  socket.ev.on('creds.update', saveCreds)
  return { socket, saveCreds }
}
