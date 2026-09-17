import { createHash } from 'node:crypto'
import type { WASocket } from 'baileys'
import { logger } from '../utils/logger.js'
import { setOpsAlert } from './ops-alerts.js'
import { opsDb, opsInstanceKey } from './ops-database.js'
import { recordOpsRuntimeLog } from './ops-runtime-log.js'

const instanceKey = opsInstanceKey()
let currentSocket: WASocket | null = null
let timer: NodeJS.Timeout | null = null
let lastSyncAt = 0
let lastSyncAttemptAt = 0
let syncing = false
let processing = false
let connectionOpen = false
const groupRefreshAt = new Map<string, number>()
const PICTURE_REFRESH_MS = 6 * 60 * 60_000

opsDb.exec(`
  CREATE TABLE IF NOT EXISTS ops_groups (
    instance_key TEXT NOT NULL,
    group_jid TEXT NOT NULL,
    name TEXT NOT NULL,
    participant_count INTEGER NOT NULL DEFAULT 0,
    admin_count INTEGER NOT NULL DEFAULT 0,
    announce INTEGER NOT NULL DEFAULT 0,
    restrict_mode INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(instance_key, group_jid)
  );
  CREATE INDEX IF NOT EXISTS idx_ops_groups_instance_updated
    ON ops_groups(instance_key, updated_at DESC);
  CREATE TABLE IF NOT EXISTS ops_group_control_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_key TEXT NOT NULL,
    action TEXT NOT NULL,
    group_jid TEXT,
    requested_by TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    requested_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_ops_group_requests_pending
    ON ops_group_control_requests(instance_key, status, requested_at);
  CREATE TABLE IF NOT EXISTS ops_group_chat_preferences (
    instance_key TEXT NOT NULL,
    group_jid TEXT NOT NULL,
    muted_until INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(instance_key, group_jid)
  );
  CREATE INDEX IF NOT EXISTS idx_ops_group_chat_preferences_instance
    ON ops_group_chat_preferences(instance_key, updated_at DESC);
  CREATE TABLE IF NOT EXISTS ops_instance_status (
    instance_key TEXT PRIMARY KEY,
    connected INTEGER NOT NULL DEFAULT 0,
    registered INTEGER NOT NULL DEFAULT 0,
    jid TEXT,
    group_count INTEGER NOT NULL DEFAULT 0,
    connected_at INTEGER,
    last_event_at INTEGER NOT NULL DEFAULT 0,
    last_group_sync_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS ops_group_daily_stats (
    instance_key TEXT NOT NULL,
    group_jid TEXT NOT NULL,
    day INTEGER NOT NULL,
    messages INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(instance_key, group_jid, day)
  );
  CREATE INDEX IF NOT EXISTS idx_ops_group_daily_stats_instance_day
    ON ops_group_daily_stats(instance_key, day DESC);
  CREATE TABLE IF NOT EXISTS ops_group_daily_senders (
    instance_key TEXT NOT NULL,
    group_jid TEXT NOT NULL,
    day INTEGER NOT NULL,
    sender_hash TEXT NOT NULL,
    PRIMARY KEY(instance_key, group_jid, day, sender_hash)
  );
  CREATE INDEX IF NOT EXISTS idx_ops_group_daily_senders_instance_day
    ON ops_group_daily_senders(instance_key, day DESC);
`)

function ensureColumn(table: string, column: string, definition: string) {
  const columns = opsDb.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name?: string }>
  if (!columns.some((item) => item.name === column)) opsDb.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

ensureColumn('ops_groups', 'description', 'TEXT')
ensureColumn('ops_groups', 'created_at', 'INTEGER NOT NULL DEFAULT 0')
ensureColumn('ops_groups', 'picture_url', 'TEXT')
ensureColumn('ops_groups', 'picture_updated_at', 'INTEGER NOT NULL DEFAULT 0')

type ParticipatingGroup = {
  id?: string
  subject?: string
  announce?: boolean
  restrict?: boolean
  creation?: number
  desc?: string
  participants?: Array<{ admin?: string | null }>
}

function currentGroupCount() {
  return Number((opsDb.prepare('SELECT COUNT(*) AS count FROM ops_groups WHERE instance_key = ?').get(instanceKey) as { count?: number } | undefined)?.count ?? 0)
}

function touchRuntime(input: {
  connected?: boolean
  registered?: boolean
  jid?: string | null
  connectedAt?: number | null
  lastGroupSyncAt?: number
  groupCount?: number
} = {}) {
  const now = Date.now()
  const socket = currentSocket
  const registered = input.registered ?? Boolean(socket?.authState.creds.registered)
  const jid = input.jid === undefined ? (socket?.user?.id ?? null) : input.jid
  const existing = opsDb.prepare(`SELECT connected, connected_at AS connectedAt, group_count AS groupCount,
    last_group_sync_at AS lastGroupSyncAt FROM ops_instance_status WHERE instance_key = ?`).get(instanceKey) as {
      connected?: number; connectedAt?: number | null; groupCount?: number; lastGroupSyncAt?: number
    } | undefined
  const connected = input.connected === undefined ? Boolean(existing?.connected) : input.connected
  const connectedAt = input.connectedAt === undefined
    ? (connected ? (existing?.connectedAt || now) : existing?.connectedAt ?? null)
    : input.connectedAt
  const groupCount = input.groupCount ?? existing?.groupCount ?? currentGroupCount()
  const lastGroupSyncAt = input.lastGroupSyncAt ?? existing?.lastGroupSyncAt ?? 0

  opsDb.prepare(`INSERT INTO ops_instance_status(
      instance_key, connected, registered, jid, group_count, connected_at, last_event_at, last_group_sync_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(instance_key) DO UPDATE SET
      connected = excluded.connected,
      registered = excluded.registered,
      jid = COALESCE(excluded.jid, ops_instance_status.jid),
      group_count = excluded.group_count,
      connected_at = COALESCE(excluded.connected_at, ops_instance_status.connected_at),
      last_event_at = excluded.last_event_at,
      last_group_sync_at = excluded.last_group_sync_at,
      updated_at = excluded.updated_at`)
    .run(instanceKey, connected ? 1 : 0, registered ? 1 : 0, jid, groupCount, connectedAt, now, lastGroupSyncAt, now)
}

function markSocketLive(socket: WASocket) {
  if (currentSocket !== socket || !socket.authState.creds.registered) return false
  if (!connectionOpen) {
    connectionOpen = true
    lastSyncAt = 0
    lastSyncAttemptAt = 0
  }
  touchRuntime({ connected: true, registered: true, jid: socket.user?.id ?? null })
  return true
}

function upsertGroup(group: ParticipatingGroup, stamp = Date.now()) {
  const jid = String(group.id ?? '')
  if (!jid.endsWith('@g.us')) return false
  const participants = group.participants ?? []
  const createdAt = Number(group.creation ?? 0) > 0 ? Number(group.creation) * 1000 : 0
  opsDb.prepare(`INSERT INTO ops_groups(
      instance_key, group_jid, name, participant_count, admin_count, announce, restrict_mode,
      description, created_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(instance_key, group_jid) DO UPDATE SET
      name = excluded.name,
      participant_count = excluded.participant_count,
      admin_count = excluded.admin_count,
      announce = excluded.announce,
      restrict_mode = excluded.restrict_mode,
      description = excluded.description,
      created_at = CASE WHEN excluded.created_at > 0 THEN excluded.created_at ELSE ops_groups.created_at END,
      updated_at = excluded.updated_at`)
    .run(
      instanceKey,
      jid,
      String(group.subject ?? jid),
      participants.length,
      participants.filter((participant) => Boolean(participant.admin)).length,
      group.announce ? 1 : 0,
      group.restrict ? 1 : 0,
      group.desc ? String(group.desc).slice(0, 1200) : null,
      createdAt,
      stamp,
    )
  return true
}

async function refreshGroupPictures(limit = 6) {
  const socket = currentSocket
  if (!socket || !connectionOpen) return
  const staleBefore = Date.now() - PICTURE_REFRESH_MS
  const rows = opsDb.prepare(`SELECT group_jid AS groupJid FROM ops_groups
    WHERE instance_key = ? AND picture_updated_at < ?
    ORDER BY picture_updated_at ASC LIMIT ?`).all(instanceKey, staleBefore, limit) as unknown as Array<{ groupJid: string }>
  for (const row of rows) {
    let pictureUrl: string | null = null
    try { pictureUrl = await socket.profilePictureUrl(row.groupJid, 'image') } catch {}
    opsDb.prepare(`UPDATE ops_groups SET picture_url = ?, picture_updated_at = ?
      WHERE instance_key = ? AND group_jid = ?`).run(pictureUrl, Date.now(), instanceKey, row.groupJid)
  }
}

function dayBucket(timestamp = Date.now()) {
  return Math.floor(timestamp / 86_400_000)
}

function senderHash(value: string) {
  return createHash('sha256').update(`${instanceKey}\u0000${value}`).digest('hex').slice(0, 32)
}

function recordGroupMessage(message: any) {
  const groupJid = String(message?.key?.remoteJid ?? '')
  if (!groupJid.endsWith('@g.us') || message?.key?.fromMe) return
  const stamp = Date.now()
  const day = dayBucket(stamp)
  opsDb.prepare(`INSERT INTO ops_group_daily_stats(instance_key, group_jid, day, messages, updated_at)
    VALUES(?, ?, ?, 1, ?)
    ON CONFLICT(instance_key, group_jid, day) DO UPDATE SET
      messages = ops_group_daily_stats.messages + 1,
      updated_at = excluded.updated_at`).run(instanceKey, groupJid, day, stamp)
  const sender = String(message?.key?.participant ?? message?.key?.participantAlt ?? message?.participant ?? '')
  if (sender) {
    opsDb.prepare(`INSERT OR IGNORE INTO ops_group_daily_senders(instance_key, group_jid, day, sender_hash)
      VALUES(?, ?, ?, ?)`).run(instanceKey, groupJid, day, senderHash(sender))
  }
}

function persistMuteState(groupJid: string, mutedUntil: number) {
  if (mutedUntil > Date.now()) {
    opsDb.prepare(`INSERT INTO ops_group_chat_preferences(instance_key, group_jid, muted_until, updated_at)
      VALUES(?, ?, ?, ?)
      ON CONFLICT(instance_key, group_jid) DO UPDATE SET
        muted_until = excluded.muted_until,
        updated_at = excluded.updated_at`)
      .run(instanceKey, groupJid, mutedUntil, Date.now())
  } else {
    opsDb.prepare('DELETE FROM ops_group_chat_preferences WHERE instance_key = ? AND group_jid = ?')
      .run(instanceKey, groupJid)
  }
}

function muteDuration(action: string) {
  if (action === 'mute:8h') return 8 * 60 * 60_000
  if (action === 'mute:7d') return 7 * 24 * 60 * 60_000
  return null
}

async function syncOneGroup(groupJid: string, force = false) {
  const socket = currentSocket
  if (!socket || !connectionOpen || !socket.authState.creds.registered || !groupJid.endsWith('@g.us')) return
  const last = groupRefreshAt.get(groupJid) ?? 0
  if (!force && Date.now() - last < 30_000) return
  groupRefreshAt.set(groupJid, Date.now())
  try {
    const metadata = await socket.groupMetadata(groupJid) as ParticipatingGroup
    upsertGroup(metadata)
    touchRuntime({ connected: true, groupCount: currentGroupCount() })
  } catch (error) {
    logger.debug({ error, instanceKey, groupJid }, 'ops live group refresh skipped')
  }
}

async function syncGroups(connectionProbe = false) {
  const socket = currentSocket
  if (!socket || syncing || !socket.authState.creds.registered || (!connectionOpen && !connectionProbe)) return
  syncing = true
  lastSyncAttemptAt = Date.now()
  try {
    const raw = await socket.groupFetchAllParticipating()
    if (!connectionOpen) connectionOpen = true
    const groups = Object.values(raw) as ParticipatingGroup[]
    const stamp = Date.now()

    opsDb.exec('BEGIN IMMEDIATE')
    try {
      for (const group of groups) upsertGroup(group, stamp)
      opsDb.prepare('DELETE FROM ops_groups WHERE instance_key = ? AND updated_at < ?').run(instanceKey, stamp)
      opsDb.prepare(`DELETE FROM ops_group_chat_preferences
        WHERE instance_key = ? AND group_jid NOT IN (SELECT group_jid FROM ops_groups WHERE instance_key = ?)`)
        .run(instanceKey, instanceKey)
      opsDb.exec('COMMIT')
    } catch (error) {
      opsDb.exec('ROLLBACK')
      throw error
    }
    lastSyncAt = stamp
    const count = groups.filter((group) => String(group.id ?? '').endsWith('@g.us')).length
    touchRuntime({ connected: true, registered: true, jid: socket.user?.id ?? null, lastGroupSyncAt: stamp, groupCount: count })
    void refreshGroupPictures()
    recordOpsRuntimeLog('info', 'groups', `Group registry synchronized: ${count} groups`, instanceKey)
    setOpsAlert({ key: 'whatsapp:group-sync', severity: 'warning', title: 'WhatsApp group sync failed', active: false, instanceKey })
  } catch (error) {
    logger.debug({ error, instanceKey, connectionProbe }, 'ops group registry sync skipped')
    if (!connectionProbe) {
      setOpsAlert({
        key: 'whatsapp:group-sync', severity: 'warning', title: 'WhatsApp group sync failed',
        detail: error instanceof Error ? error.message.slice(0, 240) : 'group_sync_failed', active: true, instanceKey,
      })
    }
  } finally {
    syncing = false
  }
}

async function processOneRequest() {
  if (!currentSocket || !connectionOpen || processing || !currentSocket.authState.creds.registered) return
  const request = opsDb.prepare(`SELECT id, action, group_jid AS groupJid
    FROM ops_group_control_requests
    WHERE instance_key = ? AND status = 'pending'
    ORDER BY requested_at ASC LIMIT 1`).get(instanceKey) as { id: number; action: string; groupJid?: string | null } | undefined
  if (!request) return

  processing = true
  const stamp = Date.now()
  opsDb.prepare("UPDATE ops_group_control_requests SET status = 'processing', started_at = ? WHERE id = ? AND status = 'pending'")
    .run(stamp, request.id)
  try {
    if (request.action === 'sync') {
      lastSyncAt = 0
      await syncGroups()
    } else if (request.action === 'leave') {
      const groupJid = String(request.groupJid ?? '')
      if (!groupJid.endsWith('@g.us')) throw new Error('JID de grupo inválido.')
      await currentSocket.groupLeave(groupJid)
      opsDb.prepare('DELETE FROM ops_groups WHERE instance_key = ? AND group_jid = ?').run(instanceKey, groupJid)
      opsDb.prepare('DELETE FROM ops_group_chat_preferences WHERE instance_key = ? AND group_jid = ?').run(instanceKey, groupJid)
      touchRuntime({ connected: true, groupCount: currentGroupCount() })
    } else if (request.action === 'unmute') {
      const groupJid = String(request.groupJid ?? '')
      if (!groupJid.endsWith('@g.us')) throw new Error('JID de grupo inválido.')
      await currentSocket.chatModify({ mute: null }, groupJid)
      persistMuteState(groupJid, 0)
    } else if (request.action.startsWith('mute:')) {
      const groupJid = String(request.groupJid ?? '')
      if (!groupJid.endsWith('@g.us')) throw new Error('JID de grupo inválido.')
      const duration = muteDuration(request.action)
      if (!duration) throw new Error('Duración de silencio no soportada.')
      await currentSocket.chatModify({ mute: duration }, groupJid)
      persistMuteState(groupJid, Date.now() + duration)
    } else if (request.action === 'announce:on' || request.action === 'announce:off') {
      const groupJid = String(request.groupJid ?? '')
      if (!groupJid.endsWith('@g.us')) throw new Error('JID de grupo inválido.')
      await currentSocket.groupSettingUpdate(groupJid, request.action === 'announce:on' ? 'announcement' : 'not_announcement')
      await syncOneGroup(groupJid, true)
    } else if (request.action === 'lock:on' || request.action === 'lock:off') {
      const groupJid = String(request.groupJid ?? '')
      if (!groupJid.endsWith('@g.us')) throw new Error('JID de grupo inválido.')
      await currentSocket.groupSettingUpdate(groupJid, request.action === 'lock:on' ? 'locked' : 'unlocked')
      await syncOneGroup(groupJid, true)
    } else {
      throw new Error('Acción de grupo no soportada.')
    }
    opsDb.prepare("UPDATE ops_group_control_requests SET status = 'completed', completed_at = ?, error = NULL WHERE id = ?")
      .run(Date.now(), request.id)
    recordOpsRuntimeLog('info', 'group-control', `Completed ${request.action}${request.groupJid ? ` for ${request.groupJid}` : ''}`, instanceKey)
    setOpsAlert({ key: 'group-control:failure', severity: 'warning', title: 'Group control action failed', active: false, instanceKey })
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
    opsDb.prepare("UPDATE ops_group_control_requests SET status = 'failed', completed_at = ?, error = ? WHERE id = ?")
      .run(Date.now(), detail, request.id)
    recordOpsRuntimeLog('error', 'group-control', `Failed ${request.action}: ${detail}`, instanceKey)
    setOpsAlert({ key: 'group-control:failure', severity: 'warning', title: 'Group control action failed', detail, active: true, instanceKey })
    logger.warn({ error, instanceKey, requestId: request.id }, 'ops group control request failed')
  } finally {
    processing = false
  }
}

function startLoop() {
  if (timer) return
  timer = setInterval(() => {
    const socket = currentSocket
    const registered = Boolean(socket?.authState.creds.registered)
    if (connectionOpen && registered && socket) touchRuntime({ connected: true, registered: true, jid: socket.user?.id ?? null })
    void processOneRequest()

    if (connectionOpen && registered && Date.now() - lastSyncAt >= 120_000) {
      void syncGroups()
    } else if (!connectionOpen && registered && socket?.user?.id && Date.now() - lastSyncAttemptAt >= 15_000) {
      void syncGroups(true)
    }

    if (Math.random() < 0.02) {
      const cutoffDay = dayBucket() - 45
      opsDb.prepare("DELETE FROM ops_group_control_requests WHERE status IN ('completed','failed') AND completed_at < ?")
        .run(Date.now() - 7 * 86_400_000)
      opsDb.prepare('DELETE FROM ops_group_chat_preferences WHERE muted_until > 0 AND muted_until <= ?')
        .run(Date.now())
      opsDb.prepare('DELETE FROM ops_group_daily_stats WHERE day < ?').run(cutoffDay)
      opsDb.prepare('DELETE FROM ops_group_daily_senders WHERE day < ?').run(cutoffDay)
    }
  }, 3000)
  timer.unref?.()
}

export function registerOpsSocket(socket: WASocket) {
  currentSocket = socket
  connectionOpen = false
  lastSyncAt = 0
  lastSyncAttemptAt = 0
  touchRuntime({ connected: false, registered: Boolean(socket.authState.creds.registered), jid: socket.user?.id ?? null })
  startLoop()

  socket.ev.on('messages.upsert', ({ messages }) => {
    if (!markSocketLive(socket)) return
    for (const message of messages) {
      const jid = String(message.key.remoteJid ?? '')
      if (jid.endsWith('@g.us')) {
        recordGroupMessage(message)
        void syncOneGroup(jid)
      }
    }
  })

  socket.ev.on('group-participants.update', ({ id }) => {
    if (!markSocketLive(socket)) return
    void syncOneGroup(String(id ?? ''), true)
  })

  socket.ev.on('connection.update', ({ connection }) => {
    if (currentSocket !== socket) return
    if (connection === 'open') {
      connectionOpen = true
      currentSocket = socket
      lastSyncAt = 0
      lastSyncAttemptAt = 0
      touchRuntime({ connected: true, registered: true, jid: socket.user?.id ?? null, connectedAt: Date.now() })
      recordOpsRuntimeLog('info', 'whatsapp', 'WhatsApp transport connected', instanceKey)
      setOpsAlert({ key: 'whatsapp:connection', severity: 'critical', title: 'WhatsApp transport disconnected', active: false, instanceKey })
      void syncGroups()
    } else if (connection === 'close') {
      connectionOpen = false
      touchRuntime({ connected: false, registered: Boolean(socket.authState.creds.registered), jid: socket.user?.id ?? null })
      recordOpsRuntimeLog('warn', 'whatsapp', 'WhatsApp transport disconnected', instanceKey)
      setOpsAlert({ key: 'whatsapp:connection', severity: 'critical', title: 'WhatsApp transport disconnected', active: true, instanceKey })
      if (currentSocket === socket) currentSocket = null
    }
  })
}
