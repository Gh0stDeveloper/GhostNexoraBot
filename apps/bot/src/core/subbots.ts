import path from 'node:path'
import { Boom } from '@hapi/boom'
import { DisconnectReason, type WAMessage, type WASocket } from 'baileys'
import { config } from '../config.js'
import { economy, type SubbotRecord } from '../services/economy.js'
import { logger } from '../utils/logger.js'
import { createSocket } from './session.js'

export type SubbotMessageHandler = (socket: WASocket, message: WAMessage, record: SubbotRecord) => Promise<void>

class SubbotManager {
  private readonly sockets = new Map<number, WASocket>()
  private handler: SubbotMessageHandler | null = null

  setMessageHandler(handler: SubbotMessageHandler) {
    this.handler = handler
  }

  private sessionDir(id: number) {
    return path.join(config.dataDir, 'subbots', String(id), 'session')
  }

  async startActive() {
    const active = economy.listSubbots().filter((item) => item.expiresAt > Date.now())
    await Promise.allSettled(active.map((record) => this.connect(record)))
  }

  async pair(ownerJid: string, rawPhone: string) {
    const phone = rawPhone.replace(/\D/g, '')
    if (phone.length < 8 || phone.length > 15) throw new Error('Número inválido. Usa código de país y solo dígitos.')
    const record = economy.getActiveSubbot(ownerJid)
    if (!record) throw new Error('No tienes una suscripción de subbot activa. Compra una en .shop.')
    economy.updateSubbot(record.id, { phone, status: 'pairing' })

    const existing = this.sockets.get(record.id)
    if (existing?.authState.creds.registered) throw new Error('Ese subbot ya está vinculado.')

    const { socket } = await this.connect({ ...record, phone, status: 'pairing' }, false)
    if (socket.authState.creds.registered) {
      economy.updateSubbot(record.id, { status: 'online', lastSeenAt: Date.now() })
      return { code: null, alreadyLinked: true }
    }

    return new Promise<{ code: string; alreadyLinked: false }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WhatsApp no entregó la solicitud de pairing a tiempo.')), 45_000)
      let requested = false
      const listener = async ({ qr }: { qr?: string }) => {
        if (!qr || requested || socket.authState.creds.registered) return
        requested = true
        try {
          const code = await socket.requestPairingCode(phone)
          clearTimeout(timeout)
          socket.ev.off('connection.update', listener as never)
          resolve({ code, alreadyLinked: false })
        } catch (error) {
          clearTimeout(timeout)
          reject(error)
        }
      }
      socket.ev.on('connection.update', listener as never)
    })
  }

  async connect(record: SubbotRecord, enableReconnect = true): Promise<{ socket: WASocket }> {
    const current = this.sockets.get(record.id)
    if (current) return { socket: current }

    const { socket } = await createSocket(this.sessionDir(record.id))
    this.sockets.set(record.id, socket)

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' || !this.handler) return
      const live = economy.getActiveSubbot(record.ownerJid)
      if (!live || live.id !== record.id || live.expiresAt <= Date.now()) return
      for (const message of messages) {
        if (!message.message || !message.key.remoteJid || message.key.remoteJid === 'status@broadcast') continue
        await this.handler(socket, message, live).catch((error) => logger.error({ error, subbotId: record.id }, 'subbot message failed'))
      }
    })

    socket.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        economy.updateSubbot(record.id, { status: 'online', lastSeenAt: Date.now() })
        logger.info({ subbotId: record.id, owner: record.ownerJid }, 'subbot connected')
      }
      if (connection !== 'close') return
      this.sockets.delete(record.id)
      const status = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
      if (status === DisconnectReason.loggedOut) {
        economy.updateSubbot(record.id, { status: 'logged_out', lastSeenAt: Date.now() })
        return
      }
      economy.updateSubbot(record.id, { status: 'offline', lastSeenAt: Date.now() })
      if (!enableReconnect || record.expiresAt <= Date.now()) return
      setTimeout(() => {
        const latest = economy.getActiveSubbot(record.ownerJid)
        if (latest?.id === record.id) void this.connect(latest).catch((error) => logger.error({ error, subbotId: record.id }, 'subbot reconnect failed'))
      }, 4000)
    })

    return { socket }
  }
}

export const subbotManager = new SubbotManager()
