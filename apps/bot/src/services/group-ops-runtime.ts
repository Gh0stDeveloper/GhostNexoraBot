import type { WASocket } from 'baileys'
import { logger } from '../utils/logger.js'
import { opsDb, opsInstanceKey } from './ops-database.js'

const instanceKey = opsInstanceKey()
let currentSocket: WASocket | null = null
let timer: NodeJS.Timeout | null = null
let lastSyncAt = 0
let syncing = false
let processing = false
let connectionOpen = false
const groupRefreshAt = new Map<string, number>()

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
`)

type ParticipatingGroup = {
  id?: string
  subject?: string
  announce?: boolean
  restrict?: boolean
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

function upsertGroup(group: ParticipatingGroup, stamp = Date.now()) {
  const jid = String(group.id ?? '')
  if (!jid.endsWith('@g.us')) return false
  const participants = group.participants ?? []
  opsDb.prepare(`INSERT INTO ops_groups(
      instance_key, group_jid, name, participant_count, admin_count, announce, restrict_mode, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(instance_key, group_jid) DO UPDATE SET
      name = excluded.name,
      participant_count = excluded.participant_count,
      admin_count = excluded.admin_count,
      announce = excluded.announce,
      restrict_mode = excluded.restrict_mode,
      updated_at = excluded.updated_at`)
    .run(
      instanceKey,
      jid,
      String(group.subject ?? jid),
      participants.length,
      participants.filter((participant) => Boolean(participant.admin)).length,
      group.announce ? 1 : 0,
      group.restrict ? 1 : 0,
      stamp,
    )
  return true
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

async function syncGroups() {
  const socket = currentSocket
  if (!socket || !connectionOpen || syncing || !socket.authState.creds.registered) return
  syncing = true
  try {
    const raw = await socket.groupFetchAllParticipating()
    const groups = Object.values(raw) as ParticipatingGroup[]
    const stamp = Date.now()

    opsDb.exec('BEGIN IMMEDIATE')
    try {
      for (const group of groups) upsertGroup(group, stamp)
      // Un fetch correcto con cero grupos significa que la instancia ya no pertenece
      // a ninguno; se limpian también los registros que quedaron de sincronizaciones anteriores.
      opsDb.prepare('DELETE FROM ops_groups WHERE instance_key = ? AND updated_at < ?').run(instanceKey, stamp)
      opsDb.exec('COMMIT')
    } catch (error) {
      opsDb.exec('ROLLBACK')
      throw error
    }
    lastSyncAt = stamp
    touchRuntime({ connected: true, lastGroupSyncAt: stamp, groupCount: groups.filter((group) => String(group.id ?? '').endsWith('@g.us')).length })
  } catch (error) {
    logger.debug({ error, instanceKey }, 'ops group registry sync skipped')
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
      touchRuntime({ connected: true, groupCount: currentGroupCount() })
    } else {
      throw new Error('Acción de grupo no soportada.')
    }
    opsDb.prepare("UPDATE ops_group_control_requests SET status = 'completed', completed_at = ?, error = NULL WHERE id = ?")
      .run(Date.now(), request.id)
  } catch (error) {
    opsDb.prepare("UPDATE ops_group_control_requests SET status = 'failed', completed_at = ?, error = ? WHERE id = ?")
      .run(Date.now(), error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500), request.id)
    logger.warn({ error, instanceKey, requestId: request.id }, 'ops group control request failed')
  } finally {
    processing = false
  }
}

function startLoop() {
  if (timer) return
  timer = setInterval(() => {
    if (connectionOpen && currentSocket?.authState.creds.registered) touchRuntime({ connected: true })
    void processOneRequest()
    if (Date.now() - lastSyncAt >= 120_000) void syncGroups()
    if (Math.random() < 0.02) {
      opsDb.prepare("DELETE FROM ops_group_control_requests WHERE status IN ('completed','failed') AND completed_at < ?")
        .run(Date.now() - 7 * 86_400_000)
    }
  }, 3000)
  timer.unref?.()
}

export function registerOpsSocket(socket: WASocket) {
  currentSocket = socket
  connectionOpen = false
  touchRuntime({ registered: Boolean(socket.authState.creds.registered), jid: socket.user?.id ?? null })
  startLoop()

  socket.ev.on('messages.upsert', ({ messages }) => {
    if (currentSocket !== socket) return
    if (socket.authState.creds.registered) {
      connectionOpen = true
      touchRuntime({ connected: true, registered: true, jid: socket.user?.id ?? null })
    }
    for (const message of messages) {
      const jid = String(message.key.remoteJid ?? '')
      if (jid.endsWith('@g.us')) void syncOneGroup(jid)
    }
  })

  socket.ev.on('group-participants.update', ({ id }) => {
    if (currentSocket === socket) void syncOneGroup(String(id ?? ''), true)
  })

  socket.ev.on('connection.update', ({ connection }) => {
    if (currentSocket !== socket) return
    if (connection === 'open') {
      connectionOpen = true
      currentSocket = socket
      lastSyncAt = 0
      touchRuntime({ connected: true, registered: true, jid: socket.user?.id ?? null, connectedAt: Date.now() })
      void syncGroups()
    } else if (connection === 'close') {
      connectionOpen = false
      touchRuntime({ connected: false, registered: Boolean(socket.authState.creds.registered), jid: socket.user?.id ?? null })
      if (currentSocket === socket) currentSocket = null
    }
  })
}
