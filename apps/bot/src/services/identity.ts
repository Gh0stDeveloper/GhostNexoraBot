import type { WAMessage, WASocket } from 'baileys'
import { economy } from './economy.js'
import { getSenderCandidates } from '../utils/message.js'

const db = economy.db
const now = () => Date.now()
const STARTING_WALLET = 250

db.exec(`
  CREATE TABLE IF NOT EXISTS identity_aliases (
    alias_jid TEXT PRIMARY KEY,
    canonical_jid TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_identity_aliases_canonical ON identity_aliases(canonical_jid);
  CREATE TABLE IF NOT EXISTS group_members (
    group_jid TEXT NOT NULL,
    user_jid TEXT NOT NULL,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    PRIMARY KEY(group_jid, user_jid)
  );
  CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_jid);
`)

function tableExists(name: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
}

function isPhoneJid(value?: string | null) {
  return Boolean(value && /@s\.whatsapp\.net$/i.test(value))
}

export function preferredJid(values: Array<string | null | undefined>) {
  const clean = [...new Set(values.filter((value): value is string => Boolean(value)))]
  return clean.find(isPhoneJid) ?? clean.find((value) => !/@lid$/i.test(value)) ?? clean[0] ?? ''
}

function mergeSimpleUserTable(table: string, column: string, alias: string, canonical: string) {
  if (!tableExists(table)) return
  try { db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`).run(canonical, alias) } catch { /* unique-key tables are handled separately or retained safely */ }
}

function mergeEconomyUser(alias: string, canonical: string) {
  if (!alias || !canonical || alias === canonical || !tableExists('economy_users')) return
  const aliasRow = db.prepare('SELECT wallet, bank, last_work as lastWork, last_rob as lastRob, profession, created_at as createdAt FROM economy_users WHERE user_jid = ?').get(alias) as
    | { wallet: number; bank: number; lastWork: number; lastRob: number; profession: string; createdAt: number }
    | undefined
  if (!aliasRow) return
  const canonicalRow = db.prepare('SELECT wallet, bank, last_work as lastWork, last_rob as lastRob, profession, created_at as createdAt FROM economy_users WHERE user_jid = ?').get(canonical) as typeof aliasRow

  if (!canonicalRow) {
    db.prepare('UPDATE economy_users SET user_jid = ? WHERE user_jid = ?').run(canonical, alias)
  } else {
    // Cada fila economy_users nació con 250 NXC. Al descubrir que alias LID y PN
    // pertenecen a la misma persona debemos conservar una sola bonificación inicial,
    // pero sí preservar todo movimiento real realizado desde ambas identidades.
    const aliasWalletContribution = Number(aliasRow.wallet) - STARTING_WALLET
    db.prepare(`UPDATE economy_users SET
      wallet = wallet + ?, bank = bank + ?, last_work = MAX(last_work, ?), last_rob = MAX(last_rob, ?),
      created_at = MIN(created_at, ?)
      WHERE user_jid = ?`).run(aliasWalletContribution, aliasRow.bank, aliasRow.lastWork, aliasRow.lastRob, aliasRow.createdAt, canonical)
    db.prepare('DELETE FROM economy_users WHERE user_jid = ?').run(alias)
  }

  mergeSimpleUserTable('economy_ledger', 'user_jid', alias, canonical)
  mergeSimpleUserTable('economy_ledger', 'counterparty_jid', alias, canonical)
  mergeSimpleUserTable('entitlements', 'user_jid', alias, canonical)
  mergeSimpleUserTable('economy_investments', 'user_jid', alias, canonical)
  mergeSimpleUserTable('economy_cda', 'user_jid', alias, canonical)
  mergeSimpleUserTable('economy_bank_loans', 'user_jid', alias, canonical)
  mergeSimpleUserTable('economy_peer_loans', 'lender_jid', alias, canonical)
  mergeSimpleUserTable('economy_peer_loans', 'borrower_jid', alias, canonical)
  mergeSimpleUserTable('waifu_claims', 'owner_jid', alias, canonical)
  mergeSimpleUserTable('subbots', 'owner_jid', alias, canonical)
  mergeSimpleUserTable('portal_tokens', 'user_jid', alias, canonical)
  mergeSimpleUserTable('economy_miners', 'user_jid', alias, canonical)
  mergeSimpleUserTable('economy_professions_v2', 'user_jid', alias, canonical)
  mergeSimpleUserTable('economy_action_cooldowns', 'user_jid', alias, canonical)
  mergeSimpleUserTable('economy_cooldowns_v2', 'user_jid', alias, canonical)

  if (tableExists('group_members')) {
    const rows = db.prepare('SELECT group_jid as groupJid, first_seen as firstSeen, last_seen as lastSeen FROM group_members WHERE user_jid = ?').all(alias) as Array<{ groupJid: string; firstSeen: number; lastSeen: number }>
    for (const row of rows) {
      db.prepare(`INSERT INTO group_members(group_jid, user_jid, first_seen, last_seen) VALUES(?, ?, ?, ?)
        ON CONFLICT(group_jid, user_jid) DO UPDATE SET first_seen = MIN(first_seen, excluded.first_seen), last_seen = MAX(last_seen, excluded.last_seen)`)
        .run(row.groupJid, canonical, row.firstSeen, row.lastSeen)
    }
    db.prepare('DELETE FROM group_members WHERE user_jid = ?').run(alias)
  }

  if (tableExists('economy_advanced_users')) {
    const old = db.prepare('SELECT last_daily as lastDaily, last_crime as lastCrime, last_slut as lastSlut FROM economy_advanced_users WHERE user_jid = ?').get(alias) as
      | { lastDaily: number; lastCrime: number; lastSlut: number }
      | undefined
    if (old) {
      db.prepare('INSERT OR IGNORE INTO economy_advanced_users(user_jid) VALUES(?)').run(canonical)
      db.prepare(`UPDATE economy_advanced_users SET last_daily = MAX(last_daily, ?), last_crime = MAX(last_crime, ?), last_slut = MAX(last_slut, ?) WHERE user_jid = ?`)
        .run(old.lastDaily, old.lastCrime, old.lastSlut, canonical)
      db.prepare('DELETE FROM economy_advanced_users WHERE user_jid = ?').run(alias)
    }
  }

  if (tableExists('waifu_roll_meta')) {
    const old = db.prepare('SELECT last_roll as lastRoll FROM waifu_roll_meta WHERE user_jid = ?').get(alias) as { lastRoll?: number } | undefined
    if (old) {
      db.prepare('INSERT OR IGNORE INTO waifu_roll_meta(user_jid, last_roll) VALUES(?, ?)').run(canonical, Number(old.lastRoll ?? 0))
      db.prepare('UPDATE waifu_roll_meta SET last_roll = MAX(last_roll, ?) WHERE user_jid = ?').run(Number(old.lastRoll ?? 0), canonical)
      db.prepare('DELETE FROM waifu_roll_meta WHERE user_jid = ?').run(alias)
    }
  }

  if (tableExists('waifu_rolls')) {
    const hasCanonical = Boolean(db.prepare('SELECT 1 FROM waifu_rolls WHERE user_jid = ?').get(canonical))
    if (!hasCanonical) mergeSimpleUserTable('waifu_rolls', 'user_jid', alias, canonical)
    else db.prepare('DELETE FROM waifu_rolls WHERE user_jid = ?').run(alias)
  }
}

export function registerIdentity(groupJid: string | undefined, aliases: string[], canonicalJid: string) {
  const canonical = canonicalJid || preferredJid(aliases)
  if (!canonical) return ''
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const alias of [...new Set([...aliases, canonical])]) {
      if (!alias) continue
      db.prepare(`INSERT INTO identity_aliases(alias_jid, canonical_jid, updated_at) VALUES(?, ?, ?)
        ON CONFLICT(alias_jid) DO UPDATE SET canonical_jid = excluded.canonical_jid, updated_at = excluded.updated_at`)
        .run(alias, canonical, now())
      if (alias !== canonical) mergeEconomyUser(alias, canonical)
    }
    if (groupJid) {
      db.prepare(`INSERT INTO group_members(group_jid, user_jid, first_seen, last_seen) VALUES(?, ?, ?, ?)
        ON CONFLICT(group_jid, user_jid) DO UPDATE SET last_seen = excluded.last_seen`)
        .run(groupJid, canonical, now(), now())
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return canonical
}

export function resolveStoredIdentity(jid: string) {
  const row = db.prepare('SELECT canonical_jid as canonicalJid FROM identity_aliases WHERE alias_jid = ?').get(jid) as { canonicalJid?: string } | undefined
  return row?.canonicalJid ?? jid
}

export async function observeMessageIdentity(socket: WASocket, message: WAMessage) {
  const chatId = message.key.remoteJid
  if (!chatId?.endsWith('@g.us')) return
  const candidates = getSenderCandidates(message)
  if (!candidates.length) return
  const metadata = await socket.groupMetadata(chatId).catch(() => null)
  const participant = metadata?.participants.find((item) => [item.id, item.phoneNumber, item.lid].filter(Boolean).some((jid) => candidates.includes(jid!)))
  const aliases = [...candidates, participant?.id, participant?.phoneNumber, participant?.lid].filter((value): value is string => Boolean(value))
  const canonical = preferredJid([participant?.phoneNumber, participant?.id, ...candidates, participant?.lid])
  if (canonical) registerIdentity(chatId, aliases, canonical)
}

export function rememberGroupMembers(groupJid: string, participants: Array<{ id?: string | null; phoneNumber?: string | null; lid?: string | null }>) {
  for (const participant of participants) {
    const aliases = [participant.id, participant.phoneNumber, participant.lid].filter((value): value is string => Boolean(value))
    const canonical = preferredJid([participant.phoneNumber, participant.id, participant.lid])
    if (canonical) registerIdentity(groupJid, aliases, canonical)
  }
}

export function groupEconomyTop(groupJid: string, limit = 10) {
  return db.prepare(`SELECT e.user_jid as userJid, e.wallet, e.bank, e.wallet + e.bank as total
    FROM group_members gm JOIN economy_users e ON e.user_jid = gm.user_jid
    WHERE gm.group_jid = ? ORDER BY total DESC LIMIT ?`)
    .all(groupJid, Math.max(1, Math.min(25, limit))) as Array<{ userJid: string; wallet: number; bank: number; total: number }>
}
