import { rm } from 'node:fs/promises'
import path from 'node:path'
import { Boom } from '@hapi/boom'
import { DisconnectReason, type WAMessage, type WASocket } from 'baileys'
import { config } from '../config.js'
import { economy, type SubbotRecord } from '../services/economy.js'
import { handleParticipantUpdateV2 } from '../services/moderation-v2.js'
import { recordSubbotMessage } from '../services/subbot-metrics.js'
import { logger } from '../utils/logger.js'
import { withTimeout } from '../utils/timeout.js'
import { createSocket } from './session.js'

export type SubbotMessageHandler = (socket: WASocket, message: WAMessage, record: SubbotRecord) => Promise<void>

type PairResult =
  | { alreadyLinked: true; code: null; qr: null }
  | { alreadyLinked: false; code: string; qr: null }
  | { alreadyLinked: false; code: null; qr: string; fallbackReason?: string }

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function normalizePhone(raw: string) {
  const phone = raw.replace(/\D/g, '')
  if (phone.length < 8 || phone.length > 15) {
    throw new Error('Número inválido. Usa código de país + número, solo dígitos (ej. 521XXXXXXXXXX).')
  }
  return phone
}

class SubbotManager {
  private readonly sockets = new Map<number, WASocket>()
  private readonly qrCache = new Map<number, { value: string; createdAt: number }>()
  private readonly resetting = new Set<number>()
  private readonly pairingLocks = new Set<number>()
  private handler: SubbotMessageHandler | null = null

  setMessageHandler(handler: SubbotMessageHandler) {
    this.handler = handler
  }

  private sessionDir(id: number) {
    return path.join(config.dataDir, 'subbots', String(id), 'session')
  }

  private freshQr(id: number) {
    const cached = this.qrCache.get(id)
    return cached && Date.now() - cached.createdAt <= 50_000 ? cached.value : null
  }

  private async waitForQr(socket: WASocket, subbotId: number, timeoutMs = 50_000) {
    const cached = this.freshQr(subbotId)
    if (cached) return cached
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.ev.off('connection.update', listener as never)
        reject(new Error('WhatsApp no generó un QR a tiempo. Prueba .subbot reset y vuelve a intentar.'))
      }, timeoutMs)
      const listener = ({ qr, connection }: { qr?: string; connection?: string }) => {
        if (qr) {
          clearTimeout(timeout)
          socket.ev.off('connection.update', listener as never)
          this.qrCache.set(subbotId, { value: qr, createdAt: Date.now() })
          resolve(qr)
          return
        }
        if (connection === 'open' || socket.authState.creds.registered) {
          clearTimeout(timeout)
          socket.ev.off('connection.update', listener as never)
          reject(new Error('La sesión ya fue vinculada.'))
        }
      }
      socket.ev.on('connection.update', listener as never)
    })
  }

  private async detachSocket(id: number) {
    const socket = this.sockets.get(id)
    this.sockets.delete(id)
    this.qrCache.delete(id)
    if (!socket) return
    try {
      socket.end(new Error('subbot detach for pairing'))
    } catch {
      /* noop */
    }
    await sleep(800)
  }

  async startActive() {
    const active = economy
      .listSubbots()
      .filter((item) => item.expiresAt > Date.now() && ['online', 'offline'].includes(item.status))
    await Promise.allSettled(active.map((record) => this.connect(record)))
  }

  async pair(ownerJid: string, rawPhone: string): Promise<PairResult> {
    const phone = normalizePhone(rawPhone)
    const record = economy.getActiveSubbot(ownerJid)
    if (!record) throw new Error('No tienes una suscripción de subbot activa. Compra una en .shop.')
    if (this.pairingLocks.has(record.id)) {
      throw new Error('Ya hay una vinculación en curso para este subbot. Espera unos segundos o usa .subbot reset.')
    }
    this.pairingLocks.add(record.id)
    economy.updateSubbot(record.id, { phone, status: 'pairing' })

    try {
      const existing = this.sockets.get(record.id)
      if (existing?.authState.creds.registered) {
        economy.updateSubbot(record.id, { status: record.status === 'online' ? 'online' : 'offline' })
        return { code: null, qr: null, alreadyLinked: true }
      }

      if (existing && !existing.authState.creds.registered) {
        await this.detachSocket(record.id)
      }

      const { socket } = await this.connect({ ...record, phone, status: 'pairing' }, false)

      await sleep(2500)

      if (socket.authState.creds.registered) {
        economy.updateSubbot(record.id, { status: 'offline' })
        return { code: null, qr: null, alreadyLinked: true }
      }

      try {
        const code = await withTimeout(
          socket.requestPairingCode(phone),
          25_000,
          `subbot pairing code #${record.id}`,
        )
        if (!code?.trim()) throw new Error('WhatsApp devolvió un código vacío.')
        logger.info({ subbotId: record.id, phone }, 'subbot pairing code issued')
        return { code: code.trim(), qr: null, alreadyLinked: false }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        logger.warn({ subbotId: record.id, errorMessage: reason }, 'subbot pairing code failed; QR fallback')

        this.qrCache.delete(record.id)
        try {
          const qr = await this.waitForQr(socket, record.id, 55_000)
          return { code: null, qr, alreadyLinked: false, fallbackReason: reason }
        } catch (qrError) {
          const qrReason = qrError instanceof Error ? qrError.message : String(qrError)
          throw new Error(
            `No se pudo obtener código ni QR (${reason} / ${qrReason}). Usa .subbot reset y vuelve a intentar.`,
          )
        }
      }
    } catch (error) {
      economy.updateSubbot(record.id, { status: 'pending' })
      throw error
    } finally {
      this.pairingLocks.delete(record.id)
    }
  }

  async qr(ownerJid: string) {
    const record = economy.getActiveSubbot(ownerJid)
    if (!record) throw new Error('No tienes una suscripción de subbot activa. Compra una en .shop.')
    if (this.pairingLocks.has(record.id)) {
      throw new Error('Ya hay una vinculación en curso. Espera o usa .subbot reset.')
    }
    this.pairingLocks.add(record.id)
    try {
      const existing = this.sockets.get(record.id)
      if (existing?.authState.creds.registered) {
        economy.updateSubbot(record.id, { status: record.status === 'online' ? 'online' : 'offline' })
        return { alreadyLinked: true as const, qr: null }
      }
      if (existing && !existing.authState.creds.registered) {
        await this.detachSocket(record.id)
      }

      const { socket } = await this.connect(record, false)
      await sleep(1500)

      if (socket.authState.creds.registered) {
        economy.updateSubbot(record.id, { status: record.status === 'online' ? 'online' : 'offline' })
        return { alreadyLinked: true as const, qr: null }
      }

      economy.updateSubbot(record.id, { status: 'pairing' })
      this.qrCache.delete(record.id)
      const qr = await this.waitForQr(socket, record.id, 55_000)
      return { alreadyLinked: false as const, qr }
    } catch (error) {
      economy.updateSubbot(record.id, { status: 'pending' })
      throw error
    } finally {
      this.pairingLocks.delete(record.id)
    }
  }

  async resetById(id: number) {
    const record = economy.listSubbots().find((item) => item.id === id)
    if (!record) throw new Error('La instancia de subbot no existe.')
    this.resetting.add(id)
    this.pairingLocks.delete(id)
    const socket = this.sockets.get(id)
    this.sockets.delete(id)
    this.qrCache.delete(id)
    economy.db
      .prepare("UPDATE subbots SET phone = NULL, status = 'pending', last_seen_at = ? WHERE id = ?")
      .run(Date.now(), id)
    try {
      if (socket) socket.end(new Error('subbot session reset'))
    } catch {
      /* noop */
    }
    await rm(this.sessionDir(id), { recursive: true, force: true })
    economy.db.prepare('DELETE FROM portal_tokens WHERE subbot_id = ?').run(id)
    setTimeout(() => this.resetting.delete(id), 5_000)
    return { ...record, phone: null, status: 'pending' }
  }

  async reset(ownerJid: string) {
    const record = economy.getActiveSubbot(ownerJid)
    if (!record) throw new Error('No tienes una instancia activa para restablecer.')
    return this.resetById(record.id)
  }

  async connect(record: SubbotRecord, enableReconnect = true): Promise<{ socket: WASocket }> {
    const current = this.sockets.get(record.id)
    if (current) return { socket: current }

    const { socket } = await createSocket(this.sessionDir(record.id))
    this.sockets.set(record.id, socket)

    socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify' || !this.handler) return
      const live = economy.getActiveSubbot(record.ownerJid)
      if (
        !live ||
        live.id !== record.id ||
        live.expiresAt <= Date.now() ||
        ['pending', 'pairing', 'logged_out', 'revoked'].includes(live.status)
      ) {
        return
      }
      for (const message of messages) {
        if (!message.message || !message.key.remoteJid || message.key.remoteJid === 'status@broadcast') continue
        recordSubbotMessage(record.id)
        const chatId = message.key.remoteJid
        void withTimeout(this.handler!(socket, message, live), 60_000, `subbot routeMessage ${chatId}`).catch(
          (error) => logger.error({ error, subbotId: record.id, chatId }, 'subbot mensaje colgado o falló'),
        )
      }
    })

    socket.ev.on('group-participants.update', (update) => {
      const live = economy.getActiveSubbot(record.ownerJid)
      if (!live || live.id !== record.id || live.expiresAt <= Date.now()) return
      void handleParticipantUpdateV2(socket, update, record.id).catch((error) =>
        logger.error(
          { error, subbotId: record.id, groupId: update.id, action: update.action },
          'subbot participant update failed',
        ),
      )
    })

    socket.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr && !socket.authState.creds.registered) {
        this.qrCache.set(record.id, { value: qr, createdAt: Date.now() })
      }
      if (connection === 'open') {
        this.qrCache.delete(record.id)
        const phoneFromWa = socket.user?.id?.split(':')[0]?.split('@')[0] ?? null
        economy.updateSubbot(record.id, {
          status: 'online',
          lastSeenAt: Date.now(),
          ...(phoneFromWa ? { phone: phoneFromWa } : {}),
        })
        logger.info({ subbotId: record.id, owner: record.ownerJid, jid: socket.user?.id }, 'subbot connected')
      }
      if (connection !== 'close') return

      this.sockets.delete(record.id)
      this.qrCache.delete(record.id)
      if (this.resetting.has(record.id)) return

      const status = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
      if (status === DisconnectReason.loggedOut) {
        economy.updateSubbot(record.id, { status: 'logged_out', lastSeenAt: Date.now() })
        return
      }

      const linked = socket.authState.creds.registered
      economy.updateSubbot(record.id, {
        status: linked ? 'offline' : 'pending',
        lastSeenAt: Date.now(),
      })

      if (!enableReconnect || record.expiresAt <= Date.now() || !linked) return

      setTimeout(() => {
        const latest = economy.getActiveSubbot(record.ownerJid)
        if (latest?.id === record.id && ['offline', 'online'].includes(latest.status)) {
          void this.connect(latest).catch((error) =>
            logger.error({ error, subbotId: record.id }, 'subbot reconnect failed'),
          )
        }
      }, 4000)
    })

    return { socket }
  }
}

export const subbotManager = new SubbotManager()
