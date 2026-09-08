import type { WASocket } from 'baileys'
import { logger } from '../utils/logger.js'
import { opsDb, opsInstanceKey } from './ops-database.js'

const instanceKey = opsInstanceKey()
let currentSocket: WASocket | null = null
let timer: NodeJS.Timeout | null = null
let lastSyncAt = 0
let syncing = false
let processing = false

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
`)

type ParticipatingGroup = {
  id?: string
  subject?: string
  announce?: boolean
  restrict?: boolean
  participants?: Array<{ admin?: string | null }>
}

async function syncGroups() {
  if (!currentSocket || syncing || !currentSocket.authState.creds.registered) return
  syncing = true
  try {
    const raw = await currentSocket.groupFetchAllParticipating()
    const groups = Object.values(raw) as ParticipatingGroup[]
    const stamp = Date.now()
    const upsert = opsDb.prepare(`INSERT INTO ops_groups(
        instance_key, group_jid, name, participant_count, admin_count, announce, restrict_mode, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(instance_key, group_jid) DO UPDATE SET
        name = excluded.name,
        participant_count = excluded.participant_count,
        admin_count = excluded.admin_count,
        announce = excluded.announce,
        restrict_mode = excluded.restrict_mode,
        updated_at = excluded.updated_at`)

    opsDb.exec('BEGIN IMMEDIATE')
    try {
      for (const group of groups) {
        const jid = String(group.id ?? '')
        if (!jid.endsWith('@g.us')) continue
        const participants = group.participants ?? []
        upsert.run(
          instanceKey,
          jid,
          String(group.subject ?? jid),
          participants.length,
          participants.filter((participant) => Boolean(participant.admin)).length,
          group.announce ? 1 : 0,
          group.restrict ? 1 : 0,
          stamp,
        )
      }
      if (groups.length) {
        opsDb.prepare('DELETE FROM ops_groups WHERE instance_key = ? AND updated_at < ?').run(instanceKey, stamp)
      }
      opsDb.exec('COMMIT')
    } catch (error) {
      opsDb.exec('ROLLBACK')
      throw error
    }
    lastSyncAt = stamp
  } catch (error) {
    logger.debug({ error, instanceKey }, 'ops group registry sync skipped')
  } finally {
    syncing = false
  }
}

async function processOneRequest() {
  if (!currentSocket || processing || !currentSocket.authState.creds.registered) return
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
  startLoop()
  socket.ev.on('connection.update', ({ connection }) => {
    if (connection === 'open') {
      currentSocket = socket
      lastSyncAt = 0
      void syncGroups()
    } else if (connection === 'close' && currentSocket === socket) {
      currentSocket = null
    }
  })
}
