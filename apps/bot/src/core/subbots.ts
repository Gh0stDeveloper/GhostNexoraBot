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
  /** Intentos de reconexión durante pairing / restart post-código */
  private readonly reconnectAttempts = new Map<number, number>()
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
      .filter((item) => item.expiresAt > Date.now() && ['online', 'offline', 'pairing'].includes(item.status))
    await Promise.allSettled(active.map((record) => this.connect(record, true)))
  }

  async pair(ownerJid: string, rawPhone: string): Promise<PairResult> {
    const phone = normalizePhone(rawPhone)
    const record = economy.getActiveSubbot(ownerJid)
    if (!record) throw new Error('No tienes una suscripción de subbot activa. Compra una en .shop.')
    if (this.pairingLocks.has(record.id)) {
      throw new Error('Ya hay una vinculación en curso para este subbot. Espera unos segundos o usa .subbot reset.')
    }
    this.pairingLocks.add(record.id)
    this.reconnectAttempts.set(record.id, 0)
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

      // enableReconnect=true: tras introducir el código WhatsApp cierra (515) y hay que reabrir
      const { socket } = await this.connect({ ...record, phone, status: 'pairing' }, true)

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
        logger.info({ subbotId: record.id, phone }, 'subbot pairing code issued — keep socket alive for restart')
        // NO cerrar el socket. WhatsApp reiniciará la conexión tras aceptar el código.
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
      // Liberar lock pero mantener socket en memoria para completar el emparejamiento
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
    this.reconnectAttempts.set(record.id, 0)
    try {
      const existing = this.sockets.get(record.id)
      if (existing?.authState.creds.registered) {
        economy.updateSubbot(record.id, { status: record.status === 'online' ? 'online' : 'offline' })
        return { alreadyLinked: true as const, qr: null }
      }
      if (existing && !existing.authState.creds.registered) {
        await this.detachSocket(record.id)
      }

      const { socket } = await this.connect(record, true)
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
    this.reconnectAttempts.delete(id)
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
        ['pending', 'logged_out', 'revoked'].includes(live.status)
      ) {
        return
      }
      // pairing también puede recibir mensajes tras open; status online se setea en open
      if (live.status === 'pairing') return
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
      if (['pending', 'pairing', 'logged_out', 'revoked'].includes(live.status)) return
      void handleParticipantUpdateV2(socket, update, record.id).catch((error) =>
        logger.error(
          { error, subbotId: record.id, groupId: update.id, action: update.action },
          'subbot participant update failed',
        ),
      )
    })

    socket.ev.on('connection.update', ({ connection, lastDisconnect, qr, isNewLogin }) => {
      if (qr && !socket.authState.creds.registered) {
        this.qrCache.set(record.id, { value: qr, createdAt: Date.now() })
      }

      // WhatsApp aceptó el emparejamiento; vendrá un close + reopen (igual que npm run pair)
      if (isNewLogin) {
        logger.info({ subbotId: record.id }, 'subbot pairing accepted (isNewLogin); waiting reconnect')
        economy.updateSubbot(record.id, { status: 'pairing', lastSeenAt: Date.now() })
      }

      if (connection === 'open') {
        this.qrCache.delete(record.id)
        this.reconnectAttempts.delete(record.id)
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

      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
      const linked = Boolean(socket.authState.creds.registered)
      const latest = economy.getActiveSubbot(record.ownerJid)
      const stillValid = Boolean(latest && latest.id === record.id && latest.expiresAt > Date.now())
      const wasPairing = latest?.status === 'pairing'

      if (statusCode === DisconnectReason.loggedOut) {
        economy.updateSubbot(record.id, { status: 'logged_out', lastSeenAt: Date.now() })
        this.reconnectAttempts.delete(record.id)
        logger.warn({ subbotId: record.id, statusCode }, 'subbot logged out')
        return
      }

      // Tras pairing, Baileys suele cerrar con 515 (restartRequired) aunque ya haya creds.
      // Hay que reconectar SIEMPRE si está registrado o sigue en fase pairing.
      const shouldReconnect =
        stillValid &&
        (linked || wasPairing) &&
        (enableReconnect || wasPairing || linked)

      if (!shouldReconnect) {
        economy.updateSubbot(record.id, {
          status: linked ? 'offline' : 'pending',
          lastSeenAt: Date.now(),
        })
        logger.warn(
          { subbotId: record.id, statusCode, linked, wasPairing },
          'subbot closed without reconnect',
        )
        return
      }

      const attempts = (this.reconnectAttempts.get(record.id) ?? 0) + 1
      this.reconnectAttempts.set(record.id, attempts)
      if (attempts > 8) {
        economy.updateSubbot(record.id, {
          status: linked ? 'offline' : 'pending',
          lastSeenAt: Date.now(),
        })
        logger.error({ subbotId: record.id, attempts, statusCode }, 'subbot reconnect gave up')
        this.reconnectAttempts.delete(record.id)
        return
      }

      economy.updateSubbot(record.id, {
        status: linked ? (wasPairing ? 'pairing' : 'offline') : 'pairing',
        lastSeenAt: Date.now(),
      })

      const delay = linked || wasPairing ? 1500 : 4000
      logger.info(
        { subbotId: record.id, statusCode, linked, wasPairing, attempts, delay },
        'subbot scheduling reconnect',
      )

      setTimeout(() => {
        const again = economy.getActiveSubbot(record.ownerJid)
        if (!again || again.id !== record.id || again.expiresAt <= Date.now()) return
        if (['logged_out', 'revoked', 'pending'].includes(again.status) && !linked) return
        void this.connect(again, true).catch((error) =>
          logger.error({ error, subbotId: record.id }, 'subbot reconnect failed'),
        )
      }, delay)
    })

    return { socket }
  }
}

export const subbotManager = new SubbotManager()
