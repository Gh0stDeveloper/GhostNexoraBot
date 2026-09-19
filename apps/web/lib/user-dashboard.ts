import type { DatabaseSync } from 'node:sqlite'
import { openBotDb, openGlobalEconomyDb, openInstanceBotDb } from './runtime'

export type UserDashboardPermissions = {
  financial: boolean
  moderation: boolean
  subbots: boolean
}

export type UserSearchRow = {
  userJid: string
  number: string
  displayName: string | null
  requests: number
  successes: number
  failures: number
  firstAt: number
  lastAt: number
  xp: number
  level: number
  commandsUsed: number
  groups: number
  warnings: number | null
  banned: boolean | null
}

export type UserDashboardDetail = UserSearchRow & {
  wallet: number | null
  bank: number | null
  totalNxc: number | null
  profession: string | null
  inventory: Array<{ item: string; quantity: number }>
  commandBreakdown: Array<{ commandName: string; requests: number; successes: number; failures: number }>
  groupBreakdown: Array<{ groupJid: string; name: string; messages: number; commands: number; lastActivityAt: number }>
  warningBreakdown: Array<{ groupJid: string; groupName: string; kind: string; count: number; lastWarning: number }>
  banRegistryAvailable: boolean
  banReason: string | null
  banExpiresAt: number | null
  subbots: Array<{ id: number; phone: string | null; status: string; expiresAt: number }>
}

function tableExists(db: DatabaseSync | null, name: string) {
  if (!db) return false
  try {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
  } catch {
    return false
  }
}

function levelFromXp(xp: number) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1)
}

function digits(value: string) {
  return value.split('@')[0]?.split(':')[0]?.replace(/\D/g, '') ?? ''
}

function normalizeQuery(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function profileFor(db: DatabaseSync | null, userJid: string) {
  if (!tableExists(db, 'community_profiles')) return { xp: 0, commandsUsed: 0 }
  const row = db!.prepare(`SELECT xp, commands_used AS commandsUsed
    FROM community_profiles WHERE user_jid = ? LIMIT 1`).get(userJid) as { xp?: number; commandsUsed?: number } | undefined
  return { xp: Number(row?.xp ?? 0), commandsUsed: Number(row?.commandsUsed ?? 0) }
}

function groupCountFor(db: DatabaseSync | null, userJid: string) {
  if (tableExists(db, 'group_user_activity_v4')) {
    const row = db!.prepare('SELECT COUNT(*) AS count FROM group_user_activity_v4 WHERE user_jid = ?').get(userJid) as { count?: number } | undefined
    return Number(row?.count ?? 0)
  }
  if (tableExists(db, 'group_members')) {
    const row = db!.prepare('SELECT COUNT(*) AS count FROM group_members WHERE user_jid = ?').get(userJid) as { count?: number } | undefined
    return Number(row?.count ?? 0)
  }
  return 0
}

function warningsFor(db: DatabaseSync | null, userJid: string) {
  if (!tableExists(db, 'group_warnings')) return null
  const row = db!.prepare('SELECT COALESCE(SUM(count), 0) AS count FROM group_warnings WHERE user_jid = ?').get(userJid) as { count?: number } | undefined
  return Number(row?.count ?? 0)
}

function banFor(opsDb: DatabaseSync | null, instanceKey: string, userJid: string) {
  if (!tableExists(opsDb, 'ops_user_bans')) {
    return { available: false, banned: null as boolean | null, reason: null as string | null, expiresAt: null as number | null }
  }
  const columns = new Set((opsDb!.prepare('PRAGMA table_info(ops_user_bans)').all() as Array<{ name?: string }>).map((row) => String(row.name ?? '')))
  const reasonColumn = columns.has('reason') ? 'reason' : 'NULL AS reason'
  const expiresColumn = columns.has('expires_at') ? 'expires_at AS expiresAt' : 'NULL AS expiresAt'
  const activeColumn = columns.has('active') ? 'active' : '1 AS active'
  const row = opsDb!.prepare(`SELECT ${activeColumn}, ${reasonColumn}, ${expiresColumn}
    FROM ops_user_bans WHERE instance_key = ? AND user_jid = ? LIMIT 1`).get(instanceKey, userJid) as Record<string, unknown> | undefined
  if (!row) return { available: true, banned: false, reason: null, expiresAt: null }
  const expiresAt = row.expiresAt === null || row.expiresAt === undefined ? null : Number(row.expiresAt)
  const active = Boolean(row.active) && (!expiresAt || expiresAt > Date.now())
  return { available: true, banned: active, reason: row.reason ? String(row.reason) : null, expiresAt }
}

function collectCandidateJids(opsDb: DatabaseSync | null, localDb: DatabaseSync | null, instanceKey: string) {
  const rows = new Map<string, {
    displayName: string | null
    requests: number
    successes: number
    failures: number
    firstAt: number
    lastAt: number
  }>()

  if (tableExists(opsDb, 'ops_user_metrics')) {
    const metrics = opsDb!.prepare(`SELECT user_jid AS userJid, display_name AS displayName,
        requests, successes, failures, first_at AS firstAt, last_at AS lastAt
      FROM ops_user_metrics WHERE instance_key = ?
      ORDER BY requests DESC, last_at DESC LIMIT 1500`).all(instanceKey) as Array<Record<string, unknown>>
    for (const row of metrics) {
      const userJid = String(row.userJid ?? '')
      if (!userJid) continue
      rows.set(userJid, {
        displayName: row.displayName ? String(row.displayName) : null,
        requests: Number(row.requests ?? 0),
        successes: Number(row.successes ?? 0),
        failures: Number(row.failures ?? 0),
        firstAt: Number(row.firstAt ?? 0),
        lastAt: Number(row.lastAt ?? 0),
      })
    }
  }

  const addLocal = (table: string, column = 'user_jid') => {
    if (!tableExists(localDb, table)) return
    const found = localDb!.prepare(`SELECT DISTINCT ${column} AS userJid FROM ${table} WHERE ${column} IS NOT NULL LIMIT 3000`).all() as Array<{ userJid?: string }>
    for (const item of found) {
      const userJid = String(item.userJid ?? '')
      if (!userJid || rows.has(userJid)) continue
      rows.set(userJid, { displayName: null, requests: 0, successes: 0, failures: 0, firstAt: 0, lastAt: 0 })
    }
  }

  addLocal('community_profiles')
  addLocal('economy_local_users')
  addLocal('group_members')
  addLocal('group_user_activity_v4')
  addLocal('group_warnings')

  return rows
}

export function searchUserDashboard(instanceKey: string, query: string, permissions: UserDashboardPermissions, limit = 50): UserSearchRow[] {
  const opsDb = openBotDb()
  const localDb = openInstanceBotDb(instanceKey)
  try {
    const candidates = collectCandidateJids(opsDb, localDb, instanceKey)
    const needle = normalizeQuery(query)
    const digitNeedle = query.replace(/\D/g, '')

    const results: UserSearchRow[] = []
    for (const [userJid, metric] of candidates) {
      const userDigits = digits(userJid)
      const name = metric.displayName
      const matches = !needle
        || userJid.toLowerCase().includes(needle)
        || Boolean(digitNeedle && userDigits.includes(digitNeedle))
        || Boolean(name && normalizeQuery(name).includes(needle))
      if (!matches) continue

      const profile = profileFor(localDb, userJid)
      const ban = permissions.moderation ? banFor(opsDb, instanceKey, userJid) : { banned: null as boolean | null }
      results.push({
        userJid,
        number: userDigits,
        displayName: name,
        requests: metric.requests,
        successes: metric.successes,
        failures: metric.failures,
        firstAt: metric.firstAt,
        lastAt: metric.lastAt,
        xp: profile.xp,
        level: levelFromXp(profile.xp),
        commandsUsed: profile.commandsUsed,
        groups: groupCountFor(localDb, userJid),
        warnings: permissions.moderation ? warningsFor(localDb, userJid) : null,
        banned: permissions.moderation ? ban.banned : null,
      })
    }

    return results
      .sort((a, b) => b.requests - a.requests || b.lastAt - a.lastAt || b.xp - a.xp || a.userJid.localeCompare(b.userJid))
      .slice(0, Math.max(1, Math.min(100, limit)))
  } finally {
    localDb?.close()
    opsDb?.close()
  }
}

function professionFor(db: DatabaseSync | null, userJid: string) {
  if (tableExists(db, 'economy_professions_v2')) {
    const row = db!.prepare('SELECT profession FROM economy_professions_v2 WHERE user_jid = ? LIMIT 1').get(userJid) as { profession?: string } | undefined
    if (row?.profession) return String(row.profession)
  }
  if (tableExists(db, 'economy_local_users')) {
    const row = db!.prepare('SELECT profession FROM economy_local_users WHERE user_jid = ? LIMIT 1').get(userJid) as { profession?: string } | undefined
    if (row?.profession) return String(row.profession)
  }
  return null
}

function inventoryFor(db: DatabaseSync | null, userJid: string) {
  if (!tableExists(db, 'rpg_inventory')) return []
  return (db!.prepare(`SELECT item, quantity FROM rpg_inventory
    WHERE user_jid = ? AND quantity > 0 ORDER BY quantity DESC, item ASC`).all(userJid) as Array<{ item?: string; quantity?: number }>)
    .map((row) => ({ item: String(row.item ?? ''), quantity: Number(row.quantity ?? 0) }))
}

function commandBreakdownFor(db: DatabaseSync | null, instanceKey: string, userJid: string) {
  if (!tableExists(db, 'ops_usage_minutes')) return []
  return (db!.prepare(`SELECT command_name AS commandName, SUM(requests) AS requests,
      SUM(successes) AS successes, SUM(failures) AS failures
    FROM ops_usage_minutes
    WHERE instance_key = ? AND user_jid = ?
    GROUP BY command_name
    ORDER BY requests DESC, command_name ASC LIMIT 30`).all(instanceKey, userJid) as Array<Record<string, unknown>>)
    .map((row) => ({
      commandName: String(row.commandName ?? ''),
      requests: Number(row.requests ?? 0),
      successes: Number(row.successes ?? 0),
      failures: Number(row.failures ?? 0),
    }))
}

function groupNames(opsDb: DatabaseSync | null, instanceKey: string) {
  const map = new Map<string, string>()
  if (!tableExists(opsDb, 'ops_groups')) return map
  const rows = opsDb!.prepare('SELECT group_jid AS groupJid, name FROM ops_groups WHERE instance_key = ?').all(instanceKey) as Array<{ groupJid?: string; name?: string }>
  for (const row of rows) if (row.groupJid) map.set(String(row.groupJid), String(row.name || row.groupJid))
  return map
}

function groupsFor(localDb: DatabaseSync | null, opsDb: DatabaseSync | null, instanceKey: string, userJid: string) {
  const names = groupNames(opsDb, instanceKey)
  if (tableExists(localDb, 'group_user_activity_v4')) {
    return (localDb!.prepare(`SELECT group_jid AS groupJid, messages, commands, last_activity_at AS lastActivityAt
      FROM group_user_activity_v4 WHERE user_jid = ?
      ORDER BY last_activity_at DESC LIMIT 100`).all(userJid) as Array<Record<string, unknown>>).map((row) => {
        const groupJid = String(row.groupJid ?? '')
        return {
          groupJid,
          name: names.get(groupJid) ?? groupJid,
          messages: Number(row.messages ?? 0),
          commands: Number(row.commands ?? 0),
          lastActivityAt: Number(row.lastActivityAt ?? 0),
        }
      })
  }
  if (tableExists(localDb, 'group_members')) {
    return (localDb!.prepare(`SELECT group_jid AS groupJid, last_seen AS lastActivityAt
      FROM group_members WHERE user_jid = ? ORDER BY last_seen DESC LIMIT 100`).all(userJid) as Array<Record<string, unknown>>).map((row) => {
        const groupJid = String(row.groupJid ?? '')
        return { groupJid, name: names.get(groupJid) ?? groupJid, messages: 0, commands: 0, lastActivityAt: Number(row.lastActivityAt ?? 0) }
      })
  }
  return []
}

function warningBreakdownFor(localDb: DatabaseSync | null, opsDb: DatabaseSync | null, instanceKey: string, userJid: string) {
  if (!tableExists(localDb, 'group_warnings')) return []
  const names = groupNames(opsDb, instanceKey)
  return (localDb!.prepare(`SELECT group_jid AS groupJid, kind, count, last_warning AS lastWarning
    FROM group_warnings WHERE user_jid = ? ORDER BY last_warning DESC LIMIT 100`).all(userJid) as Array<Record<string, unknown>>)
    .map((row) => {
      const groupJid = String(row.groupJid ?? '')
      return {
        groupJid,
        groupName: names.get(groupJid) ?? groupJid,
        kind: String(row.kind ?? ''),
        count: Number(row.count ?? 0),
        lastWarning: Number(row.lastWarning ?? 0),
      }
    })
}

function ownedSubbots(mainDb: DatabaseSync | null, userJid: string) {
  if (!tableExists(mainDb, 'subbots')) return []
  return (mainDb!.prepare(`SELECT id, phone, status, expires_at AS expiresAt
    FROM subbots WHERE owner_jid = ? ORDER BY created_at DESC`).all(userJid) as Array<Record<string, unknown>>)
    .map((row) => ({
      id: Number(row.id),
      phone: row.phone ? String(row.phone) : null,
      status: String(row.status ?? 'unknown'),
      expiresAt: Number(row.expiresAt ?? 0),
    }))
}

export function readUserDashboardDetail(
  instanceKey: string,
  userJid: string,
  permissions: UserDashboardPermissions,
): UserDashboardDetail | null {
  const opsDb = openBotDb()
  const localDb = openInstanceBotDb(instanceKey)
  const economyDb = permissions.financial ? openGlobalEconomyDb() : null
  const mainDb = permissions.subbots ? openBotDb() : null
  try {
    const candidates = collectCandidateJids(opsDb, localDb, instanceKey)
    const metric = candidates.get(userJid)
    if (!metric) return null
    const profile = profileFor(localDb, userJid)
    const ban = permissions.moderation ? banFor(opsDb, instanceKey, userJid) : {
      available: false,
      banned: null as boolean | null,
      reason: null as string | null,
      expiresAt: null as number | null,
    }

    let wallet: number | null = null
    let bank: number | null = null
    if (economyDb && tableExists(economyDb, 'global_economy_users')) {
      const row = economyDb.prepare('SELECT wallet, bank FROM global_economy_users WHERE user_jid = ? LIMIT 1').get(userJid) as { wallet?: number; bank?: number } | undefined
      if (row) {
        wallet = Number(row.wallet ?? 0)
        bank = Number(row.bank ?? 0)
      }
    }

    return {
      userJid,
      number: digits(userJid),
      displayName: metric.displayName,
      requests: metric.requests,
      successes: metric.successes,
      failures: metric.failures,
      firstAt: metric.firstAt,
      lastAt: metric.lastAt,
      xp: profile.xp,
      level: levelFromXp(profile.xp),
      commandsUsed: profile.commandsUsed,
      groups: groupCountFor(localDb, userJid),
      warnings: permissions.moderation ? warningsFor(localDb, userJid) : null,
      banned: permissions.moderation ? ban.banned : null,
      wallet,
      bank,
      totalNxc: wallet === null || bank === null ? null : wallet + bank,
      profession: professionFor(localDb, userJid),
      inventory: permissions.financial ? inventoryFor(localDb, userJid) : [],
      commandBreakdown: commandBreakdownFor(opsDb, instanceKey, userJid),
      groupBreakdown: groupsFor(localDb, opsDb, instanceKey, userJid),
      warningBreakdown: permissions.moderation ? warningBreakdownFor(localDb, opsDb, instanceKey, userJid) : [],
      banRegistryAvailable: permissions.moderation && ban.available,
      banReason: permissions.moderation ? ban.reason : null,
      banExpiresAt: permissions.moderation ? ban.expiresAt : null,
      subbots: permissions.subbots ? ownedSubbots(mainDb, userJid) : [],
    }
  } finally {
    economyDb?.close()
    localDb?.close()
    opsDb?.close()
    mainDb?.close()
  }
}
