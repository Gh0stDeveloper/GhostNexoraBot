import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { config } from '../config.js'

export const COIN_NAME = 'Nexora Coins'
export const COIN_SYMBOL = 'NXC'
const STARTING_WALLET = 250

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

type LegacyEconomyRow = {
  userJid: string
  wallet: number
  bank: number
  lastWork: number
  lastRob: number
  profession: string
  createdAt: number
}

const now = () => Date.now()
const int = (value: unknown) => Number(value ?? 0)

function digitsFromJid(jid: string): string {
  return jid.split('@')[0]?.split(':')[0]?.replace(/\D/g, '') ?? ''
}

function normalizeProfession(value: string): ProfessionId | null {
  const normalized = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [id, config] of Object.entries(PROFESSIONS) as Array<[ProfessionId, typeof PROFESSIONS[ProfessionId]]>) {
    if (id === normalized || config.aliases.some((alias) => alias.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === normalized)) return id
  }
  return null
}

function sqlPath(value: string) {
  return value.replace(/'/g, "''")
}

export class EconomyStore {
  readonly file = path.join(config.dataDir, 'ghostnexora.sqlite')
  readonly walletFile: string
  readonly db: DatabaseSync
  readonly walletDb: DatabaseSync

  constructor() {
    mkdirSync(config.dataDir, { recursive: true })
    this.walletFile = process.env.NEXORA_GLOBAL_ECONOMY_DB || path.join(config.dataDir, 'nexora-economy.sqlite')
    mkdirSync(path.dirname(this.walletFile), { recursive: true })

    this.db = new DatabaseSync(this.file)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS economy_users (
        user_jid TEXT PRIMARY KEY,
        wallet INTEGER NOT NULL DEFAULT ${STARTING_WALLET},
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

    const columns = this.db.prepare('PRAGMA main.table_info(economy_users)').all() as Array<{ name: string }>
    if (!columns.some((column) => column.name === 'profession')) {
      this.db.exec(`ALTER TABLE economy_users ADD COLUMN profession TEXT NOT NULL DEFAULT '${DEFAULT_PROFESSION}'`)
    }

    // Perfil/cooldowns siguen siendo locales a cada instancia. Solo wallet/bank son globales.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS economy_local_users (
        user_jid TEXT PRIMARY KEY,
        last_work INTEGER NOT NULL DEFAULT 0,
        last_rob INTEGER NOT NULL DEFAULT 0,
        profession TEXT NOT NULL DEFAULT '${DEFAULT_PROFESSION}',
        created_at INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO economy_local_users(user_jid, last_work, last_rob, profession, created_at)
      SELECT user_jid, last_work, last_rob, COALESCE(profession, '${DEFAULT_PROFESSION}'), created_at FROM main.economy_users;
    `)

    this.walletDb = new DatabaseSync(this.walletFile)
    this.walletDb.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000;')
    this.walletDb.exec(`
      CREATE TABLE IF NOT EXISTS global_economy_users (
        user_jid TEXT PRIMARY KEY,
        wallet INTEGER NOT NULL DEFAULT ${STARTING_WALLET},
        bank INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS wallet_migrations (
        source_id TEXT PRIMARY KEY,
        source_file TEXT NOT NULL,
        users_migrated INTEGER NOT NULL DEFAULT 0,
        migrated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS economy_global_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_jid TEXT NOT NULL,
        kind TEXT NOT NULL,
        amount INTEGER NOT NULL,
        counterparty_jid TEXT,
        note TEXT,
        instance_role TEXT,
        instance_id INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_global_ledger_user ON economy_global_ledger(user_jid, created_at DESC);
    `)

    const role = process.env.NEXORA_INSTANCE_ROLE === 'subbot' ? 'subbot' : 'main'
    const sourceId = role === 'subbot' ? `subbot:${process.env.NEXORA_SUBBOT_ID || path.basename(config.dataDir)}` : 'main'
    this.migrateLegacyDb(this.db, sourceId, this.file)

    // El padre también recoge saldos de subbots guardados, incluso si hoy están offline/expirados.
    if (role === 'main') this.migrateStoredSubbots()

    // Toda referencia SQL existente a economy_users queda redirigida de forma transparente:
    // wallet/bank -> DB global; cooldown/profesión -> DB local de la instancia.
    this.db.exec(`ATTACH DATABASE '${sqlPath(this.walletFile)}' AS global_wallet;`)
    this.db.exec(`
      DROP VIEW IF EXISTS temp.economy_users;
      DROP TRIGGER IF EXISTS temp.gn_economy_users_insert;
      DROP TRIGGER IF EXISTS temp.gn_economy_users_update;
      DROP TRIGGER IF EXISTS temp.gn_economy_users_delete;

      CREATE TEMP VIEW economy_users AS
      SELECT
        g.user_jid,
        g.wallet,
        g.bank,
        COALESCE(l.last_work, 0) AS last_work,
        COALESCE(l.last_rob, 0) AS last_rob,
        COALESCE(l.profession, '${DEFAULT_PROFESSION}') AS profession,
        COALESCE(l.created_at, g.created_at) AS created_at
      FROM global_wallet.global_economy_users AS g
      LEFT JOIN main.economy_local_users AS l ON l.user_jid = g.user_jid;

      CREATE TEMP TRIGGER gn_economy_users_insert
      INSTEAD OF INSERT ON economy_users
      BEGIN
        INSERT OR IGNORE INTO global_economy_users(user_jid, wallet, bank, created_at, updated_at)
        VALUES(NEW.user_jid, COALESCE(NEW.wallet, ${STARTING_WALLET}), COALESCE(NEW.bank, 0), COALESCE(NEW.created_at, unixepoch('subsec') * 1000), unixepoch('subsec') * 1000);
        INSERT OR IGNORE INTO economy_local_users(user_jid, last_work, last_rob, profession, created_at)
        VALUES(NEW.user_jid, COALESCE(NEW.last_work, 0), COALESCE(NEW.last_rob, 0), COALESCE(NEW.profession, '${DEFAULT_PROFESSION}'), COALESCE(NEW.created_at, unixepoch('subsec') * 1000));
      END;

      CREATE TEMP TRIGGER gn_economy_users_update
      INSTEAD OF UPDATE ON economy_users
      BEGIN
        INSERT OR IGNORE INTO global_economy_users(user_jid, wallet, bank, created_at, updated_at)
        VALUES(NEW.user_jid, COALESCE(NEW.wallet, ${STARTING_WALLET}), COALESCE(NEW.bank, 0), COALESCE(NEW.created_at, unixepoch('subsec') * 1000), unixepoch('subsec') * 1000);
        UPDATE global_economy_users
          SET wallet = COALESCE(NEW.wallet, wallet), bank = COALESCE(NEW.bank, bank), updated_at = unixepoch('subsec') * 1000
          WHERE user_jid = OLD.user_jid;
        INSERT OR IGNORE INTO economy_local_users(user_jid, last_work, last_rob, profession, created_at)
        VALUES(NEW.user_jid, COALESCE(NEW.last_work, 0), COALESCE(NEW.last_rob, 0), COALESCE(NEW.profession, '${DEFAULT_PROFESSION}'), COALESCE(NEW.created_at, unixepoch('subsec') * 1000));
        UPDATE economy_local_users
          SET last_work = COALESCE(NEW.last_work, last_work), last_rob = COALESCE(NEW.last_rob, last_rob), profession = COALESCE(NEW.profession, profession)
          WHERE user_jid = OLD.user_jid;
      END;

      CREATE TEMP TRIGGER gn_economy_users_delete
      INSTEAD OF DELETE ON economy_users
      BEGIN
        DELETE FROM global_economy_users WHERE user_jid = OLD.user_jid;
        DELETE FROM economy_local_users WHERE user_jid = OLD.user_jid;
      END;
    `)
  }

  private legacyRows(source: DatabaseSync): LegacyEconomyRow[] {
    const table = source.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'economy_users'").get()
    if (!table) return []
    return source.prepare(`
      SELECT user_jid AS userJid, wallet, bank,
             COALESCE(last_work, 0) AS lastWork,
             COALESCE(last_rob, 0) AS lastRob,
             COALESCE(profession, '${DEFAULT_PROFESSION}') AS profession,
             created_at AS createdAt
      FROM economy_users
    `).all() as LegacyEconomyRow[]
  }

  private migrateLegacyDb(source: DatabaseSync, sourceId: string, sourceFile: string) {
    const migrated = this.walletDb.prepare('SELECT 1 FROM wallet_migrations WHERE source_id = ?').get(sourceId)
    if (migrated) return
    const rows = this.legacyRows(source)

    this.walletDb.exec('BEGIN IMMEDIATE')
    try {
      for (const row of rows) {
        const wallet = Math.max(0, int(row.wallet))
        const bank = Math.max(0, int(row.bank))
        const existing = this.walletDb.prepare('SELECT wallet, bank FROM global_economy_users WHERE user_jid = ?').get(row.userJid) as { wallet: number; bank: number } | undefined
        if (!existing) {
          this.walletDb.prepare('INSERT INTO global_economy_users(user_jid, wallet, bank, created_at, updated_at) VALUES(?, ?, ?, ?, ?)')
            .run(row.userJid, wallet, bank, row.createdAt || now(), now())
          continue
        }

        // Cada DB antigua regalaba 250 NXC al crear usuario. Al fusionar fuentes se
        // suma el patrimonio real y se descuenta esa bonificación duplicada.
        const extraTotal = Math.max(0, wallet + bank - STARTING_WALLET)
        if (!extraTotal) continue
        const extraBank = Math.min(bank, extraTotal)
        const extraWallet = extraTotal - extraBank
        this.walletDb.prepare('UPDATE global_economy_users SET wallet = wallet + ?, bank = bank + ?, updated_at = ? WHERE user_jid = ?')
          .run(extraWallet, extraBank, now(), row.userJid)
        this.walletDb.prepare('INSERT INTO economy_global_ledger(user_jid, kind, amount, note, instance_role, instance_id, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)')
          .run(row.userJid, 'legacy_wallet_merge', extraTotal, `source:${sourceId}`, sourceId.startsWith('subbot:') ? 'subbot' : 'main', Number(sourceId.split(':')[1] || 0) || null, now())
      }
      this.walletDb.prepare('INSERT INTO wallet_migrations(source_id, source_file, users_migrated, migrated_at) VALUES(?, ?, ?, ?)')
        .run(sourceId, sourceFile, rows.length, now())
      this.walletDb.exec('COMMIT')
    } catch (error) {
      this.walletDb.exec('ROLLBACK')
      throw error
    }
  }

  private migrateStoredSubbots() {
    const root = path.join(config.dataDir, 'subbots')
    if (!existsSync(root)) return
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const legacyFile = path.join(root, entry.name, 'ghostnexora.sqlite')
      if (!existsSync(legacyFile)) continue
      const sourceId = `subbot:${entry.name}`
      if (this.walletDb.prepare('SELECT 1 FROM wallet_migrations WHERE source_id = ?').get(sourceId)) continue
      let source: DatabaseSync | null = null
      try {
        source = new DatabaseSync(legacyFile, { readOnly: true })
        this.migrateLegacyDb(source, sourceId, legacyFile)
      } catch {
        // Un subbot activo puede estar rotando su WAL justo durante el arranque.
        // El propio worker repetirá la migración de esa fuente al iniciar.
      } finally {
        try { source?.close() } catch {}
      }
    }
  }

  private ensureUser(userJid: string) {
    this.db.prepare('INSERT OR IGNORE INTO economy_users(user_jid, created_at) VALUES(?, ?)').run(userJid, now())
  }

  private ledger(userJid: string, kind: string, amount: number, counterparty?: string, note?: string) {
    this.db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, counterparty_jid, note, created_at) VALUES(?, ?, ?, ?, ?, ?)')
      .run(userJid, kind, amount, counterparty ?? null, note ?? null, now())
    try {
      this.walletDb.prepare('INSERT INTO economy_global_ledger(user_jid, kind, amount, counterparty_jid, note, instance_role, instance_id, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)')
        .run(userJid, kind, amount, counterparty ?? null, note ?? null, process.env.NEXORA_INSTANCE_ROLE === 'subbot' ? 'subbot' : 'main', Number(process.env.NEXORA_SUBBOT_ID || 0) || null, now())
    } catch {}
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

  hasEntitlement(userJid: string, kind: string, extraCandidates: string[] = []) {
    const stamp = now()
    const candidates = [...new Set([userJid, ...extraCandidates].filter(Boolean))]

    for (const candidate of candidates) {
      const row = this.db
        .prepare('SELECT MAX(expires_at) as expiresAt FROM entitlements WHERE user_jid = ? AND kind = ? AND expires_at > ?')
        .get(candidate, kind, stamp) as { expiresAt?: number | null }
      const expires = int(row.expiresAt)
      if (expires) return expires
    }

    const digitsList = [...new Set(candidates.map(digitsFromJid).filter((d) => d.length >= 8))]
    for (const digits of digitsList) {
      const rows = this.db
        .prepare(`SELECT user_jid as userJid, expires_at as expiresAt FROM entitlements WHERE kind = ? AND expires_at > ? AND user_jid LIKE ?`)
        .all(kind, stamp, `${digits}@%`) as Array<{ userJid: string; expiresAt: number }>
      let best = 0
      for (const row of rows) {
        if (digitsFromJid(row.userJid) === digits && int(row.expiresAt) > best) best = int(row.expiresAt)
      }
      if (best) return best
    }
    return null
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
      welcome: Boolean(row?.welcome), antiLink: Boolean(row?.antiLink), antiSpam: Boolean(row?.antiSpam), adultAllowed: Boolean(row?.adultAllowed),
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
