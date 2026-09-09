import { fork, type ChildProcess } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { economy, type SubbotRecord } from '../services/economy.js'
import { subbotCustomization } from '../services/subbot-customization.js'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

export type PairResult =
  | { alreadyLinked: true; code: null; qr: null }
  | { alreadyLinked: false; code: string; qr: null }
  | { alreadyLinked: false; code: null; qr: string; fallbackReason?: string }

type WorkerMessage = {
  type?: string
  subbotId?: number
  status?: string
  code?: string | null
  qr?: string | null
  ok?: boolean
  alreadyLinked?: boolean
  error?: string
  jid?: string | null
  phone?: string | null
  registered?: boolean
}

type Waiter = {
  resolve: (value: { ok: boolean; code?: string | null; qr?: string | null; alreadyLinked?: boolean; error?: string }) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

type WorkerHealth = {
  lastHeartbeat: number
  status: string
  restarts: number
}

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

function workerPath() {
  if (!config.isTermuxLite) return fileURLToPath(new URL('../subbot-worker.js', import.meta.url))
  const runningFromTypescript = import.meta.url.endsWith('.ts')
  const relative = runningFromTypescript ? '../subbot-worker-termux.ts' : '../subbot-worker-termux.js'
  return fileURLToPath(new URL(relative, import.meta.url))
}

class SubbotManager {
  private readonly workers = new Map<number, ChildProcess>()
  private readonly pairingLocks = new Set<number>()
  private readonly waiters = new Map<string, Waiter>()
  private readonly health = new Map<number, WorkerHealth>()
  private readonly intentionalStops = new Set<number>()
  private watchdogTimer: NodeJS.Timeout | null = null

  private key(id: number, action: 'pair' | 'qr') {
    return `${id}:${action}`
  }

  private rejectWaiters(id: number, error: Error) {
    for (const action of ['pair', 'qr'] as const) {
      const key = this.key(id, action)
      const waiter = this.waiters.get(key)
      if (!waiter) continue
      clearTimeout(waiter.timer)
      this.waiters.delete(key)
      waiter.reject(error)
    }
  }

  private markHealth(id: number, status: string) {
    const current = this.health.get(id)
    this.health.set(id, {
      lastHeartbeat: Date.now(),
      status,
      restarts: current?.restarts ?? 0,
    })
  }

  private handleWorkerMessage(message: WorkerMessage) {
    const id = Number(message.subbotId ?? 0)
    if (!id) return

    if (message.type === 'heartbeat') {
      this.markHealth(id, String(message.status ?? this.health.get(id)?.status ?? 'unknown'))
      return
    }

    if (message.type === 'status') {
      const status = String(message.status ?? 'offline')
      this.markHealth(id, status)
      const patch: { status?: string; lastSeenAt?: number; phone?: string } = {
        status,
        lastSeenAt: Date.now(),
      }
      if (typeof message.phone === 'string' && message.phone) patch.phone = message.phone
      economy.updateSubbot(id, patch)
      return
    }

    if (message.type === 'pair-result' || message.type === 'qr-result') {
      const action = message.type === 'pair-result' ? 'pair' : 'qr'
      const key = this.key(id, action)
      const waiter = this.waiters.get(key)
      if (!waiter) return
      clearTimeout(waiter.timer)
      this.waiters.delete(key)
      waiter.resolve({
        ok: Boolean(message.ok),
        code: message.code ?? null,
        qr: message.qr ?? null,
        alreadyLinked: Boolean(message.alreadyLinked),
        error: message.error,
      })
    }
  }

  /**
   * Reconciles old installations where an entitlement existed but the subbots
   * row was never created (or its expiry was not extended). The entitlement is
   * the durable purchase/grant; the row is only the runtime instance record.
   */
  getActive(ownerJid: string): SubbotRecord | null {
    let record = economy.getActiveSubbot(ownerJid)
    const entitlementExpiresAt = economy.hasEntitlement(ownerJid, 'subbot_slot')

    if (!record && entitlementExpiresAt) {
      economy.createSubbot(ownerJid, entitlementExpiresAt)
      record = economy.getActiveSubbot(ownerJid)
    } else if (record && entitlementExpiresAt && entitlementExpiresAt > record.expiresAt) {
      economy.db.prepare('UPDATE subbots SET expires_at = ? WHERE id = ?').run(entitlementExpiresAt, record.id)
      record = economy.getActiveSubbot(ownerJid)
    }
    return record
  }

  private stopWorker(id: number, reason: string) {
    const worker = this.workers.get(id)
    if (!worker) return
    this.intentionalStops.add(id)
    this.workers.delete(id)
    this.health.delete(id)
    this.rejectWaiters(id, new Error(reason))
    try { worker.send({ type: 'stop' }) } catch {}
    setTimeout(() => {
      try {
        if (worker.exitCode === null) worker.kill('SIGKILL')
      } catch {}
      this.intentionalStops.delete(id)
    }, 1800).unref?.()
  }

  private spawn(record: SubbotRecord) {
    const existing = this.workers.get(record.id)
    if (existing && existing.connected && existing.exitCode === null) return existing
    if (existing) this.workers.delete(record.id)

    const customization = subbotCustomization.get(record.id)
    const worker = fork(workerPath(), [], {
      cwd: config.workspaceRoot,
      env: {
        ...process.env,
        NEXORA_RUNTIME_PROFILE: config.runtimeProfile,
        NEXORA_INSTANCE_ROLE: 'subbot',
        NEXORA_SUBBOT_ID: String(record.id),
        NEXORA_SUBBOT_OWNER_JID: record.ownerJid,
        NEXORA_SUBBOT_PHONE: record.phone ?? '',
        NEXORA_SUBBOT_EXPIRES_AT: String(record.expiresAt),
        NEXORA_SUBBOT_SHORT_NAME: customization.shortName,
        NEXORA_SUBBOT_NAME: customization.longName,
        // Wallet/bank and paid/granted entitlements are shared with MainBot.
        NEXORA_GLOBAL_ECONOMY_DB: economy.walletFile,
        NEXORA_GLOBAL_CONTROL_DB: economy.file,
        DATA_DIR: path.join(config.dataDir, 'subbots', String(record.id)),
        SESSION_DIR: path.join(config.dataDir, 'subbots', String(record.id), 'session'),
        BOT_NAME: customization.longName,
        PREFIX: '.',
        OWNER_NUMBERS: '',
        AUTO_REACT: 'true',
        ADULT_PRIVATE_ENABLED: 'false',
        WELCOME_IMAGE_URL: '',
        TELEGRAM_BOT_TOKEN: '',
        TELEGRAM_CHANNEL_ID: '',
        TELEGRAM_CHANNEL_URL: '',
        OLLAMA_ENABLED: 'false',
        OLLAMA_MODEL: 'qwen2.5:1.5b',
        WEB_ENABLED: 'false',
        ADMIN_WEB_TOKEN: crypto.randomBytes(24).toString('hex'),
        PUBLIC_WEB_URL: 'http://127.0.0.1:3000',
      },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })

    this.workers.set(record.id, worker)
    this.markHealth(record.id, 'starting')
    worker.on('message', (message: WorkerMessage) => this.handleWorkerMessage(message))
    worker.on('error', (error) => {
      logger.error({ error, subbotId: record.id }, 'isolated subbot process error')
      economy.updateSubbot(record.id, { status: 'offline', lastSeenAt: Date.now() })
      this.rejectWaiters(record.id, error instanceof Error ? error : new Error(String(error)))
    })
    worker.on('exit', (code, signal) => {
      if (this.workers.get(record.id) === worker) this.workers.delete(record.id)
      this.health.delete(record.id)
      this.rejectWaiters(record.id, new Error(`Subbot #${record.id} process exited (${code ?? signal ?? 'unknown'})`))

      const intentional = this.intentionalStops.has(record.id)
      if (intentional) return
      const current = this.getActive(record.ownerJid)
      if (!current || current.id !== record.id || current.expiresAt <= Date.now()) return
      if (['logged_out', 'revoked', 'pending', 'expired'].includes(current.status)) return

      economy.updateSubbot(record.id, { status: 'offline', lastSeenAt: Date.now() })
      const previousRestarts = this.health.get(record.id)?.restarts ?? 0
      setTimeout(() => {
        const latest = this.getActive(record.ownerJid)
        if (!latest || latest.id !== record.id || latest.expiresAt <= Date.now()) return
        const restarted = this.spawn({ ...latest, status: 'offline' })
        const state = this.health.get(record.id)
        if (state) state.restarts = previousRestarts + 1
        logger.warn({ subbotId: record.id, pid: restarted.pid }, 'subbot worker restarted after unexpected exit')
      }, 3000).unref?.()
    })
    return worker
  }

  private startWatchdog() {
    if (this.watchdogTimer) return
    this.watchdogTimer = setInterval(() => {
      const stamp = Date.now()
      for (const [id] of this.workers) {
        const state = this.health.get(id)
        if (!state) continue
        if (stamp - state.lastHeartbeat <= 90_000) continue

        const record = economy.listSubbots().find((item) => item.id === id)
        if (!record || record.expiresAt <= stamp || ['pending', 'logged_out', 'revoked', 'expired'].includes(record.status)) continue

        logger.warn({ subbotId: id, lastHeartbeat: state.lastHeartbeat, status: state.status }, 'subbot watchdog restarting stale worker')
        this.stopWorker(id, `Subbot #${id} reiniciado por watchdog.`)
        economy.updateSubbot(id, { status: 'offline', lastSeenAt: stamp })
        setTimeout(() => {
          const current = this.getActive(record.ownerJid)
          if (current?.id === id && current.expiresAt > Date.now()) this.spawn({ ...current, status: 'offline' })
        }, 2500).unref?.()
      }
    }, 30_000)
    this.watchdogTimer.unref?.()
  }

  private async request(record: SubbotRecord, action: 'pair' | 'qr') {
    const worker = this.spawn(record)
    const key = this.key(record.id, action)
    if (this.waiters.has(key)) throw new Error(`Ya hay una operación ${action} en curso para este subbot.`)

    const result = await new Promise<{ ok: boolean; code?: string | null; qr?: string | null; alreadyLinked?: boolean; error?: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(key)
        reject(new Error(`El subbot #${record.id} no respondió a tiempo.`))
      }, action === 'qr' ? 65_000 : 35_000)
      this.waiters.set(key, { resolve, reject, timer })
      worker.send({ type: action }, (error) => {
        if (!error) return
        clearTimeout(timer)
        this.waiters.delete(key)
        reject(error)
      })
    })
    return result
  }

  async startActive() {
    this.startWatchdog()
    const active = economy
      .listSubbots()
      .filter((item) => item.expiresAt > Date.now() && ['online', 'offline', 'pairing', 'starting'].includes(item.status))
    for (const record of active) {
      this.spawn(record)
      await sleep(150)
    }
  }

  async pair(ownerJid: string, rawPhone: string): Promise<PairResult> {
    const phone = normalizePhone(rawPhone)
    const record = this.getActive(ownerJid)
    if (!record) throw new Error('No tienes una suscripción de subbot activa. Compra una en .shop o solicita una concesión al staff.')
    if (this.pairingLocks.has(record.id)) throw new Error('Ya hay una vinculación en curso para este subbot.')
    this.pairingLocks.add(record.id)
    economy.updateSubbot(record.id, { phone, status: 'pairing', lastSeenAt: Date.now() })

    try {
      const worker = this.spawn({ ...record, phone, status: 'pairing' })
      const customization = subbotCustomization.get(record.id)
      worker.send({ type: 'phone', value: phone })
      worker.send({ type: 'customization', shortName: customization.shortName, name: customization.longName })
      const result = await this.request({ ...record, phone, status: 'pairing' }, 'pair')
      if (result.alreadyLinked || (result.ok && !result.code)) return { alreadyLinked: true, code: null, qr: null }
      if (result.ok && result.code) return { alreadyLinked: false, code: result.code, qr: null }

      const qrResult = await this.request({ ...record, phone, status: 'pairing' }, 'qr')
      if (qrResult.alreadyLinked || (qrResult.ok && !qrResult.qr)) return { alreadyLinked: true, code: null, qr: null }
      if (!qrResult.ok || !qrResult.qr) throw new Error(result.error || qrResult.error || 'WhatsApp no devolvió código ni QR.')
      return { alreadyLinked: false, code: null, qr: qrResult.qr, fallbackReason: result.error }
    } finally {
      this.pairingLocks.delete(record.id)
    }
  }

  async qr(ownerJid: string) {
    const record = this.getActive(ownerJid)
    if (!record) throw new Error('No tienes una suscripción de subbot activa. Compra una en .shop o solicita una concesión al staff.')
    if (this.pairingLocks.has(record.id)) throw new Error('Ya hay una vinculación en curso para este subbot.')
    this.pairingLocks.add(record.id)
    economy.updateSubbot(record.id, { status: 'pairing', lastSeenAt: Date.now() })
    try {
      const worker = this.spawn(record)
      worker.send({ type: 'phone', value: record.phone ?? '' })
      const customization = subbotCustomization.get(record.id)
      worker.send({ type: 'customization', shortName: customization.shortName, name: customization.longName })
      const result = await this.request({ ...record, status: 'pairing' }, 'qr')
      if (result.alreadyLinked || (result.ok && !result.qr)) return { alreadyLinked: true as const, qr: null }
      if (!result.ok || !result.qr) throw new Error(result.error || 'WhatsApp no devolvió un QR válido.')
      return { alreadyLinked: false as const, qr: result.qr }
    } finally {
      this.pairingLocks.delete(record.id)
    }
  }

  async deleteById(id: number) {
    const record = economy.listSubbots().find((item) => item.id === id)
    if (!record) throw new Error('La instancia de subbot no existe.')

    this.stopWorker(id, `Subbot #${id} eliminado permanentemente.`)
    this.pairingLocks.delete(id)
    await rm(path.join(config.dataDir, 'subbots', String(id)), { recursive: true, force: true })

    const db = economy.db
    const instanceKey = `subbot:${id}`
    const tableExists = (name: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
    const deleteInstanceRows = (table: string) => {
      if (tableExists(table)) db.prepare(`DELETE FROM ${table} WHERE instance_key = ?`).run(instanceKey)
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      if (tableExists('portal_tokens')) db.prepare('DELETE FROM portal_tokens WHERE subbot_id = ?').run(id)
      if (tableExists('subbot_customization')) db.prepare('DELETE FROM subbot_customization WHERE subbot_id = ?').run(id)
      deleteInstanceRows('ops_groups')
      deleteInstanceRows('ops_group_control_requests')
      deleteInstanceRows('ops_instance_status')
      deleteInstanceRows('ops_pipeline_metrics')
      deleteInstanceRows('ops_command_metrics')
      deleteInstanceRows('ops_command_catalog')
      // El entitlement representa el slot vigente del owner, no una fila histórica.
      // Si existe otra instancia futura del mismo owner, conservarlo evita que la
      // limpieza de una instancia vieja rompa la nueva.
      if (tableExists('entitlements')) {
        db.prepare(`DELETE FROM entitlements
          WHERE user_jid = ? AND kind = 'subbot_slot'
          AND NOT EXISTS (
            SELECT 1 FROM subbots
            WHERE owner_jid = ? AND id <> ? AND expires_at > ?
          )`).run(record.ownerJid, record.ownerJid, id, Date.now())
      }
      db.prepare('DELETE FROM subbots WHERE id = ?').run(id)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }

    logger.warn({ subbotId: id, ownerJid: record.ownerJid }, 'subbot instance permanently deleted')
    return record
  }

  async resetById(id: number) {
    const record = economy.listSubbots().find((item) => item.id === id)
    if (!record) throw new Error('La instancia de subbot no existe.')

    this.stopWorker(id, `Subbot #${id} reiniciado.`)
    await rm(path.join(config.dataDir, 'subbots', String(id)), { recursive: true, force: true })
    economy.db.prepare("UPDATE subbots SET phone = NULL, status = 'pending', last_seen_at = ? WHERE id = ?").run(Date.now(), id)
    economy.db.prepare('DELETE FROM portal_tokens WHERE subbot_id = ?').run(id)
    return { ...record, phone: null, status: 'pending' }
  }

  async reset(ownerJid: string) {
    const record = this.getActive(ownerJid)
    if (!record) throw new Error('No tienes una instancia activa para restablecer.')
    return this.resetById(record.id)
  }
}

export const subbotManager = new SubbotManager()
