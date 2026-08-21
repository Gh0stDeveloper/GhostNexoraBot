import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { config } from '../config.js'

export const COIN_NAME = 'Nexora Coins'
export const COIN_SYMBOL = 'NXC'

export const PROFESSIONS = {
  developer: { label: 'Desarrollador/a', emoji: '💻', min: 70, max: 190, description: 'Aplicaciones, bots, APIs y automatización.', aliases: ['dev', 'programador', 'programadora', 'developer'] },
  sysadmin: { label: 'Administrador/a de sistemas', emoji: '🖥️', min: 75, max: 200, description: 'Servidores, redes, Linux y despliegues.', aliases: ['sysadmin', 'servidores', 'admin', 'sistemas'] },
  security: { label: 'Analista de seguridad', emoji: '🛡️', min: 80, max: 205, description: 'Auditoría, hardening y respuesta a incidentes.', aliases: ['security', 'seguridad', 'cyber', 'ciberseguridad'] },
  designer: { label: 'Diseñador/a', emoji: '🎨', min: 55, max: 175, description: 'UI, branding, ilustración y contenido visual.', aliases: ['designer', 'disenador', 'disenadora', 'diseño', 'diseno'] },
  editor: { label: 'Editor/a multimedia', emoji: '🎬', min: 60, max: 185, description: 'Video, audio, clips y producción multimedia.', aliases: ['editor', 'edicion', 'multimedia'] },
  qa: { label: 'QA / Tester', emoji: '🧪', min: 60, max: 180, description: 'Pruebas, reportes y control de calidad.', aliases: ['qa', 'tester', 'testing', 'pruebas'] },
  moderator: { label: 'Moderador/a', emoji: '🛡️', min: 50, max: 165, description: 'Moderación de comunidades y soporte de normas.', aliases: ['mod', 'moderador', 'moderadora', 'moderation'] },
  support: { label: 'Soporte técnico', emoji: '🎧', min: 50, max: 170, description: 'Atención a usuarios y resolución de incidencias.', aliases: ['support', 'soporte', 'helpdesk'] },
  data: { label: 'Analista de datos', emoji: '📊', min: 65, max: 190, description: 'Datos, reportes, métricas y automatizaciones.', aliases: ['data', 'datos', 'analista'] },
} as const

export type ProfessionId = keyof typeof PROFESSIONS
const DEFAULT_PROFESSION: ProfessionId = 'developer'

export type GroupPolicy = {
  welcome: boolean
  antiLink: boolean
  antiSpam: boolean
  adultAllowed: boolean
}

export type SubbotRecord = {
  id: number
  ownerJid: string
  phone: string | null
  status: string
  expiresAt: number
  createdAt: number
  lastSeenAt: number | null
  messagesProcessed: number
  downloadBytes: number
}

const now = () => Date.now()
const int = (value: unknown) => Number(value ?? 0)

function normalizeProfession(value: string): ProfessionId | null {
  const normalized = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [id, config] of Object.entries(PROFESSIONS) as Array<[ProfessionId, typeof PROFESSIONS[ProfessionId]]>) {
    if (id === normalized || config.aliases.some((alias) => alias.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === normalized)) return id
  }
  return null
}

export class EconomyStore {
  readonly file = path.join(config.dataDir, 'ghostnexora.sqlite')
  readonly db: DatabaseSync

  constructor() {
    mkdirSync(config.dataDir, { recursive: true })
    this.db = new DatabaseSync(this.file)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS economy_users (
        user_jid TEXT PRIMARY KEY,
        wallet INTEGER NOT NULL DEFAULT 250,
        bank INTEGER NOT NULL DEFAULT 0,
        last_work INTEGER NOT NULL DEFAULT 0,
        last_rob INTEGER NOT NULL DEFAULT 0,
        profession TEXT NOT NULL DEFAULT 'developer',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS economy_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_jid TEXT NOT NULL,
        kind TEXT NOT NULL,
        amount INTEGER NOT NULL,
        counterparty_jid TEXT,
        note TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS entitlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_jid TEXT NOT NULL,
        kind TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entitlements_user_kind ON entitlements(user_jid, kind, expires_at);
      CREATE TABLE IF NOT EXISTS group_policies (
        group_jid TEXT PRIMARY KEY,
        welcome INTEGER NOT NULL DEFAULT 0,
        anti_link INTEGER NOT NULL DEFAULT 0,
        anti_spam INTEGER NOT NULL DEFAULT 0,
        adult_allowed INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS subbots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_jid TEXT NOT NULL,
        phone TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER,
        messages_processed INTEGER NOT NULL DEFAULT 0,
        download_bytes INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_subbots_owner ON subbots(owner_jid, expires_at);
      CREATE TABLE IF NOT EXISTS portal_tokens (
        token_hash TEXT PRIMARY KEY,
        user_jid TEXT NOT NULL,
        subbot_id INTEGER,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(subbot_id) REFERENCES subbots(id) ON DELETE CASCADE
      );
    `)

    const columns = this.db.prepare('PRAGMA table_info(economy_users)').all() as Array<{ name: string }>
    if (!columns.some((column) => column.name === 'profession')) {
      this.db.exec(`ALTER TABLE economy_users ADD COLUMN profession TEXT NOT NULL DEFAULT '${DEFAULT_PROFESSION}'`)
    }
  }

  private ensureUser(userJid: string) {
    this.db.prepare('INSERT OR IGNORE INTO economy_users(user_jid, created_at) VALUES(?, ?)').run(userJid, now())
  }

  private ledger(userJid: string, kind: string, amount: number, counterparty?: string, note?: string) {
    this.db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, counterparty_jid, note, created_at) VALUES(?, ?, ?, ?, ?, ?)')
      .run(userJid, kind, amount, counterparty ?? null, note ?? null, now())
  }

  balance(userJid: string) {
    this.ensureUser(userJid)
    const row = this.db.prepare('SELECT wallet, bank FROM economy_users WHERE user_jid = ?').get(userJid) as { wallet: number; bank: number }
    return { wallet: int(row.wallet), bank: int(row.bank), total: int(row.wallet) + int(row.bank) }
  }

  profession(userJid: string) {
    this.ensureUser(userJid)
    const row = this.db.prepare('SELECT profession FROM economy_users WHERE user_jid = ?').get(userJid) as { profession?: string }
    const id = normalizeProfession(row.profession ?? '') ?? DEFAULT_PROFESSION
    if (row.profession !== id) this.db.prepare('UPDATE economy_users SET profession = ? WHERE user_jid = ?').run(id, userJid)
    return { id, ...PROFESSIONS[id] }
  }

  setProfession(userJid: string, value: string) {
    this.ensureUser(userJid)
    const id = normalizeProfession(value)
    if (!id) throw new Error(`Profesión inválida. Usa .job para ver las ${Object.keys(PROFESSIONS).length} disponibles.`)
    this.db.prepare('UPDATE economy_users SET profession = ? WHERE user_jid = ?').run(id, userJid)
    return { id, ...PROFESSIONS[id] }
  }

  work(userJid: string) {
    this.ensureUser(userJid)
    const row = this.db.prepare('SELECT last_work FROM economy_users WHERE user_jid = ?').get(userJid) as { last_work: number }
    const cooldownMs = 60_000
    const remaining = Math.max(0, int(row.last_work) + cooldownMs - now())
    if (remaining > 0) return { ok: false as const, remaining }
    const profession = this.profession(userJid)
    const reward = profession.min + Math.floor(Math.random() * (profession.max - profession.min + 1))
    this.db.prepare('UPDATE economy_users SET wallet = wallet + ?, last_work = ? WHERE user_jid = ?').run(reward, now(), userJid)
    this.ledger(userJid, 'work', reward, undefined, `profession:${profession.id}`)
    return { ok: true as const, reward, profession, ...this.balance(userJid) }
  }

  deposit(userJid: string, amount: number) {
    this.ensureUser(userJid)
    const value = Math.floor(amount)
    if (value <= 0) throw new Error('La cantidad debe ser mayor a 0.')
    const current = this.balance(userJid)
    if (current.wallet < value) throw new Error('No tienes suficientes Nexora Coins en la cartera.')
    this.db.prepare('UPDATE economy_users SET wallet = wallet - ?, bank = bank + ? WHERE user_jid = ?').run(value, value, userJid)
    this.ledger(userJid, 'deposit', -value, undefined, 'wallet -> bank')
    return this.balance(userJid)
  }

  withdraw(userJid: string, amount: number) {
    this.ensureUser(userJid)
    const value = Math.floor(amount)
    if (value <= 0) throw new Error('La cantidad debe ser mayor a 0.')
    const current = this.balance(userJid)
    if (current.bank < value) throw new Error('No tienes suficientes Nexora Coins en el banco.')
    this.db.prepare('UPDATE economy_users SET bank = bank - ?, wallet = wallet + ? WHERE user_jid = ?').run(value, value, userJid)
    this.ledger(userJid, 'withdraw', value, undefined, 'bank -> wallet')
    return this.balance(userJid)
  }

  transfer(fromJid: string, toJid: string, amount: number) {
    if (fromJid === toJid) throw new Error('No puedes transferirte a ti mismo.')
    const value = Math.floor(amount)
    if (value <= 0) throw new Error('La cantidad debe ser mayor a 0.')
    this.ensureUser(fromJid)
    this.ensureUser(toJid)
    if (this.balance(fromJid).wallet < value) throw new Error('No tienes suficientes Nexora Coins en la cartera.')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('UPDATE economy_users SET wallet = wallet - ? WHERE user_jid = ?').run(value, fromJid)
      this.db.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(value, toJid)
      this.ledger(fromJid, 'transfer_out', -value, toJid)
      this.ledger(toJid, 'transfer_in', value, fromJid)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return this.balance(fromJid)
  }

  rob(thiefJid: string, victimJid: string) {
    if (thiefJid === victimJid) throw new Error('No puedes robarte a ti mismo.')
    this.ensureUser(thiefJid)
    this.ensureUser(victimJid)
    const row = this.db.prepare('SELECT last_rob FROM economy_users WHERE user_jid = ?').get(thiefJid) as { last_rob: number }
    const cooldownMs = 60 * 60_000
    const remaining = Math.max(0, int(row.last_rob) + cooldownMs - now())
    if (remaining > 0) return { ok: false as const, remaining }
    const victim = this.balance(victimJid)
    this.db.prepare('UPDATE economy_users SET last_rob = ? WHERE user_jid = ?').run(now(), thiefJid)
    if (victim.wallet < 50) return { ok: true as const, success: false, amount: 0, reason: 'empty' as const }

    const success = Math.random() < 0.45
    if (!success) {
      const penalty = Math.min(this.balance(thiefJid).wallet, 35 + Math.floor(Math.random() * 66))
      if (penalty > 0) {
        this.db.prepare('UPDATE economy_users SET wallet = wallet - ? WHERE user_jid = ?').run(penalty, thiefJid)
        this.ledger(thiefJid, 'rob_penalty', -penalty, victimJid)
      }
      return { ok: true as const, success: false, amount: penalty, reason: 'failed' as const }
    }

    const amount = Math.max(20, Math.min(800, Math.floor(victim.wallet * (0.05 + Math.random() * 0.2))))
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('UPDATE economy_users SET wallet = wallet - ? WHERE user_jid = ?').run(amount, victimJid)
      this.db.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(amount, thiefJid)
      this.ledger(thiefJid, 'rob_gain', amount, victimJid)
      this.ledger(victimJid, 'rob_loss', -amount, thiefJid)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return { ok: true as const, success: true, amount, reason: 'success' as const }
  }

  top(limit = 10) {
    return this.db.prepare('SELECT user_jid as userJid, wallet, bank, wallet + bank as total FROM economy_users ORDER BY total DESC LIMIT ?')
      .all(Math.max(1, Math.min(25, limit))) as Array<{ userJid: string; wallet: number; bank: number; total: number }>
  }

  grantEntitlement(userJid: string, kind: string, durationMs: number, metadata?: Record<string, unknown>) {
    const active = this.db.prepare('SELECT MAX(expires_at) as expiresAt FROM entitlements WHERE user_jid = ? AND kind = ?').get(userJid, kind) as { expiresAt?: number | null }
    const base = Math.max(now(), int(active.expiresAt))
    const expiresAt = base + durationMs
    this.db.prepare('INSERT INTO entitlements(user_jid, kind, expires_at, metadata, created_at) VALUES(?, ?, ?, ?, ?)')
      .run(userJid, kind, expiresAt, metadata ? JSON.stringify(metadata) : null, now())
    return expiresAt
  }

  hasEntitlement(userJid: string, kind: string) {
    const row = this.db.prepare('SELECT MAX(expires_at) as expiresAt FROM entitlements WHERE user_jid = ? AND kind = ? AND expires_at > ?')
      .get(userJid, kind, now()) as { expiresAt?: number | null }
    return int(row.expiresAt) || null
  }

  purchase(userJid: string, price: number, kind: string, durationMs: number, metadata?: Record<string, unknown>) {
    this.ensureUser(userJid)
    const current = this.balance(userJid)
    if (current.bank + current.wallet < price) throw new Error(`Necesitas ${price.toLocaleString()} ${COIN_SYMBOL}.`)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      let remaining = price
      const walletUse = Math.min(current.wallet, remaining)
      remaining -= walletUse
      const bankUse = remaining
      this.db.prepare('UPDATE economy_users SET wallet = wallet - ?, bank = bank - ? WHERE user_jid = ?').run(walletUse, bankUse, userJid)
      this.ledger(userJid, 'purchase', -price, undefined, kind)
      const expiresAt = this.grantEntitlement(userJid, kind, durationMs, metadata)
      this.db.exec('COMMIT')
      return { expiresAt, balance: this.balance(userJid) }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  getGroupPolicy(groupJid: string): GroupPolicy {
    const row = this.db.prepare('SELECT welcome, anti_link as antiLink, anti_spam as antiSpam, adult_allowed as adultAllowed FROM group_policies WHERE group_jid = ?').get(groupJid) as Record<string, number> | undefined
    return {
      welcome: Boolean(row?.welcome),
      antiLink: Boolean(row?.antiLink),
      antiSpam: Boolean(row?.antiSpam),
      adultAllowed: Boolean(row?.adultAllowed),
    }
  }

  setGroupPolicy(groupJid: string, key: keyof GroupPolicy, enabled: boolean) {
    const columns: Record<keyof GroupPolicy, string> = { welcome: 'welcome', antiLink: 'anti_link', antiSpam: 'anti_spam', adultAllowed: 'adult_allowed' }
    this.db.prepare('INSERT OR IGNORE INTO group_policies(group_jid, updated_at) VALUES(?, ?)').run(groupJid, now())
    this.db.prepare(`UPDATE group_policies SET ${columns[key]} = ?, updated_at = ? WHERE group_jid = ?`).run(enabled ? 1 : 0, now(), groupJid)
    return this.getGroupPolicy(groupJid)
  }

  createSubbot(ownerJid: string, expiresAt: number) {
    const result = this.db.prepare('INSERT INTO subbots(owner_jid, status, expires_at, created_at) VALUES(?, ?, ?, ?)')
      .run(ownerJid, 'pending', expiresAt, now())
    return Number(result.lastInsertRowid)
  }

  getActiveSubbot(ownerJid: string): SubbotRecord | null {
    const row = this.db.prepare('SELECT id, owner_jid as ownerJid, phone, status, expires_at as expiresAt, created_at as createdAt, last_seen_at as lastSeenAt, messages_processed as messagesProcessed, download_bytes as downloadBytes FROM subbots WHERE owner_jid = ? AND expires_at > ? ORDER BY expires_at DESC LIMIT 1')
      .get(ownerJid, now()) as SubbotRecord | undefined
    return row ?? null
  }

  listSubbots(): SubbotRecord[] {
    return this.db.prepare('SELECT id, owner_jid as ownerJid, phone, status, expires_at as expiresAt, created_at as createdAt, last_seen_at as lastSeenAt, messages_processed as messagesProcessed, download_bytes as downloadBytes FROM subbots ORDER BY created_at DESC').all() as SubbotRecord[]
  }

  updateSubbot(id: number, patch: { phone?: string; status?: string; lastSeenAt?: number }) {
    if (patch.phone !== undefined) this.db.prepare('UPDATE subbots SET phone = ? WHERE id = ?').run(patch.phone, id)
    if (patch.status !== undefined) this.db.prepare('UPDATE subbots SET status = ? WHERE id = ?').run(patch.status, id)
    if (patch.lastSeenAt !== undefined) this.db.prepare('UPDATE subbots SET last_seen_at = ? WHERE id = ?').run(patch.lastSeenAt, id)
  }

  createPortalToken(userJid: string, subbotId: number | null, ttlMs = 7 * 86400_000) {
    const token = randomBytes(24).toString('base64url')
    const hash = createHash('sha256').update(token).digest('hex')
    const expiresAt = now() + ttlMs
    this.db.prepare('INSERT INTO portal_tokens(token_hash, user_jid, subbot_id, expires_at, created_at) VALUES(?, ?, ?, ?, ?)')
      .run(hash, userJid, subbotId, expiresAt, now())
    return { token, expiresAt }
  }

  resolvePortalToken(token: string) {
    const hash = createHash('sha256').update(token).digest('hex')
    return this.db.prepare('SELECT user_jid as userJid, subbot_id as subbotId, expires_at as expiresAt FROM portal_tokens WHERE token_hash = ? AND expires_at > ?')
      .get(hash, now()) as { userJid: string; subbotId: number | null; expiresAt: number } | undefined
  }
}

export const economy = new EconomyStore()
