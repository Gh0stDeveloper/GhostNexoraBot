import { openBotDb } from './runtime'

export type OpsStage = {
  id: string
  name: string
  invocations: number
  minUs: number
  avgUs: number
  maxUs: number
  lastUs: number
  firstAt: number
  lastAt: number
  status: 'optimal' | 'bottleneck'
}

export type OpsCommand = {
  commandName: string
  category: string
  description: string
  invocations: number
  successes: number
  failures: number
  successRate: number
  minUs: number
  avgUs: number
  maxUs: number
  lastUs: number
  heapDeltaKb: number
  lastErrorAt: number
  status: 'optimal' | 'warning' | 'slow' | 'critical'
}

export type OpsGroup = {
  groupJid: string
  name: string
  participantCount: number
  adminCount: number
  announce: boolean
  restrictMode: boolean
  mutedUntil: number
  updatedAt: number
}

export type OpsProviderHealth = {
  providerId: string
  label: string
  status: 'online' | 'degraded' | 'offline' | 'unknown'
  requests: number
  successes: number
  failures: number
  consecutiveFailures: number
  errorRate: number
  averageLatencyMs: number
  lastLatencyMs: number
  lastSuccessAt: number
  lastFailureAt: number
  lastError: string | null
  updatedAt: number
}

export type OpsRequest = {
  id: number
  action: string
  groupJid: string | null
  status: string
  error: string | null
  requestedAt: number
  completedAt: number | null
}

export type OpsRuntimeStatus = {
  connected: boolean
  registered: boolean
  groupCount: number
  connectedAt: number
  lastEventAt: number
  lastGroupSyncAt: number
  updatedAt: number
  fresh: boolean
}

export type OpsSnapshot = {
  instanceKey: string
  runtime: OpsRuntimeStatus
  summary: {
    throughputMps: number
    averageE2eUs: number
    processingNodes: number
    auditedCommands: number
    bottlenecks: number
  }
  stages: OpsStage[]
  commands: OpsCommand[]
  groups: OpsGroup[]
  providers: OpsProviderHealth[]
  requests: OpsRequest[]
}

const STAGES = [
  ['01', 'Ingesta Baileys', 50_000],
  ['02', 'Serializador de Mensajes', 150_000],
  ['03', 'Sincronización DB & State', 100_000],
  ['04', 'Filtros & Permisos', 150_000],
  ['05', 'Matcher & Cola de Ejecución', 100_000],
  ['06', 'Ejecutor Sandbox Plugin', 750_000],
  ['07', 'Despacho Socket Baileys', 250_000],
] as const

function commandStatus(avgUs: number, maxUs: number, successRate: number): OpsCommand['status'] {
  if (successRate < 90 || avgUs >= 2_000_000 || maxUs >= 5_000_000) return 'critical'
  if (avgUs >= 750_000 || maxUs >= 2_000_000 || successRate < 97) return 'slow'
  if (avgUs >= 250_000 || maxUs >= 1_000_000 || successRate < 99) return 'warning'
  return 'optimal'
}

function providerStatus(input: {
  requests: number
  successes: number
  consecutiveFailures: number
  updatedAt: number
}): OpsProviderHealth['status'] {
  if (!input.requests) return 'unknown'
  if (input.updatedAt > 0 && Date.now() - input.updatedAt > 30 * 60_000) return 'unknown'
  if (input.consecutiveFailures >= 3 || (!input.successes && input.consecutiveFailures > 0)) return 'offline'
  if (input.consecutiveFailures > 0) return 'degraded'
  return input.successes > 0 ? 'online' : 'unknown'
}

function empty(instanceKey: string): OpsSnapshot {
  return {
    instanceKey,
    runtime: { connected: false, registered: false, groupCount: 0, connectedAt: 0, lastEventAt: 0, lastGroupSyncAt: 0, updatedAt: 0, fresh: false },
    summary: { throughputMps: 0, averageE2eUs: 0, processingNodes: 7, auditedCommands: 0, bottlenecks: 0 },
    stages: STAGES.map(([id, name]) => ({ id, name, invocations: 0, minUs: 0, avgUs: 0, maxUs: 0, lastUs: 0, firstAt: 0, lastAt: 0, status: 'optimal' })),
    commands: [], groups: [], providers: [], requests: [],
  }
}

function tableExists(db: NonNullable<ReturnType<typeof openBotDb>>, name: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
}

export function readOpsSnapshot(instanceKey: string): OpsSnapshot {
  const db = openBotDb()
  if (!db) return empty(instanceKey)
  try {
    const snapshot = empty(instanceKey)

    if (tableExists(db, 'ops_instance_status')) {
      const row = db.prepare(`SELECT connected, registered, group_count AS groupCount,
        connected_at AS connectedAt, last_event_at AS lastEventAt,
        last_group_sync_at AS lastGroupSyncAt, updated_at AS updatedAt
        FROM ops_instance_status WHERE instance_key = ?`).get(instanceKey) as Record<string, number> | undefined
      if (row) {
        const updatedAt = Number(row.updatedAt ?? 0)
        const fresh = updatedAt > 0 && Date.now() - updatedAt < 180_000
        snapshot.runtime = {
          connected: Boolean(row.connected) && fresh,
          registered: Boolean(row.registered),
          groupCount: Number(row.groupCount ?? 0),
          connectedAt: Number(row.connectedAt ?? 0),
          lastEventAt: Number(row.lastEventAt ?? 0),
          lastGroupSyncAt: Number(row.lastGroupSyncAt ?? 0),
          updatedAt,
          fresh,
        }
      }
    }

    if (tableExists(db, 'ops_pipeline_metrics')) {
      const rows = db.prepare(`SELECT stage_id AS stageId, stage_name AS stageName, invocations, total_us AS totalUs,
        min_us AS minUs, max_us AS maxUs, last_us AS lastUs, first_at AS firstAt, last_at AS lastAt
        FROM ops_pipeline_metrics WHERE instance_key = ?`).all(instanceKey) as unknown as Array<Record<string, number | string>>
      const byStage = new Map(rows.map((row) => [String(row.stageId), row]))
      snapshot.stages = STAGES.map(([id, name, threshold]) => {
        const row = byStage.get(id)
        const invocations = Number(row?.invocations ?? 0)
        const avgUs = invocations ? Math.round(Number(row?.totalUs ?? 0) / invocations) : 0
        return {
          id, name, invocations, avgUs,
          minUs: Number(row?.minUs ?? 0), maxUs: Number(row?.maxUs ?? 0), lastUs: Number(row?.lastUs ?? 0),
          firstAt: Number(row?.firstAt ?? 0), lastAt: Number(row?.lastAt ?? 0),
          status: avgUs >= threshold ? 'bottleneck' : 'optimal',
        }
      })
    }

    if (tableExists(db, 'ops_command_catalog')) {
      const rows = db.prepare(`SELECT c.command_name AS commandName, c.category, c.description,
        COALESCE(m.invocations, 0) AS invocations, COALESCE(m.successes, 0) AS successes,
        COALESCE(m.failures, 0) AS failures, COALESCE(m.total_us, 0) AS totalUs,
        COALESCE(m.min_us, 0) AS minUs, COALESCE(m.max_us, 0) AS maxUs,
        COALESCE(m.last_us, 0) AS lastUs, COALESCE(m.heap_delta_total, 0) AS heapDeltaTotal,
        COALESCE(m.last_error_at, 0) AS lastErrorAt
        FROM ops_command_catalog c
        LEFT JOIN ops_command_metrics m ON m.instance_key = c.instance_key AND m.command_name = c.command_name
        WHERE c.instance_key = ?
        ORDER BY COALESCE(m.total_us * 1.0 / NULLIF(m.invocations, 0), 0) DESC, c.command_name ASC`)
        .all(instanceKey) as unknown as Array<Record<string, number | string>>
      snapshot.commands = rows.map((row) => {
        const invocations = Number(row.invocations ?? 0)
        const successes = Number(row.successes ?? 0)
        const avgUs = invocations ? Math.round(Number(row.totalUs ?? 0) / invocations) : 0
        const maxUs = Number(row.maxUs ?? 0)
        const successRate = invocations ? successes / invocations * 100 : 100
        return {
          commandName: String(row.commandName), category: String(row.category), description: String(row.description),
          invocations, successes, failures: Number(row.failures ?? 0), successRate,
          minUs: Number(row.minUs ?? 0), avgUs, maxUs, lastUs: Number(row.lastUs ?? 0),
          heapDeltaKb: invocations ? Math.round((Number(row.heapDeltaTotal ?? 0) / invocations) / 1024) : 0,
          lastErrorAt: Number(row.lastErrorAt ?? 0), status: commandStatus(avgUs, maxUs, successRate),
        }
      })
    }

    if (tableExists(db, 'ops_groups')) {
      const hasPreferences = tableExists(db, 'ops_group_chat_preferences')
      const query = hasPreferences
        ? `SELECT g.group_jid AS groupJid, g.name, g.participant_count AS participantCount,
            g.admin_count AS adminCount, g.announce, g.restrict_mode AS restrictMode,
            COALESCE(p.muted_until, 0) AS mutedUntil, g.updated_at AS updatedAt
          FROM ops_groups g
          LEFT JOIN ops_group_chat_preferences p
            ON p.instance_key = g.instance_key AND p.group_jid = g.group_jid
          WHERE g.instance_key = ? ORDER BY g.name COLLATE NOCASE ASC`
        : `SELECT group_jid AS groupJid, name, participant_count AS participantCount,
            admin_count AS adminCount, announce, restrict_mode AS restrictMode,
            0 AS mutedUntil, updated_at AS updatedAt
          FROM ops_groups WHERE instance_key = ? ORDER BY name COLLATE NOCASE ASC`
      snapshot.groups = db.prepare(query)
        .all(instanceKey).map((row: any) => ({
          groupJid: String(row.groupJid), name: String(row.name), participantCount: Number(row.participantCount),
          adminCount: Number(row.adminCount), announce: Boolean(row.announce), restrictMode: Boolean(row.restrictMode),
          mutedUntil: Number(row.mutedUntil ?? 0), updatedAt: Number(row.updatedAt),
        })) as OpsGroup[]
      snapshot.runtime.groupCount = snapshot.groups.length
    }

    if (tableExists(db, 'ops_provider_health')) {
      snapshot.providers = db.prepare(`SELECT
          provider_id AS providerId,
          provider_label AS label,
          requests,
          successes,
          failures,
          consecutive_failures AS consecutiveFailures,
          total_latency_ms AS totalLatencyMs,
          last_latency_ms AS lastLatencyMs,
          last_success_at AS lastSuccessAt,
          last_failure_at AS lastFailureAt,
          last_error AS lastError,
          updated_at AS updatedAt
        FROM ops_provider_health
        WHERE instance_key = ?
        ORDER BY provider_label COLLATE NOCASE ASC`)
        .all(instanceKey).map((row: any) => {
          const requests = Number(row.requests ?? 0)
          const successes = Number(row.successes ?? 0)
          const failures = Number(row.failures ?? 0)
          const consecutiveFailures = Number(row.consecutiveFailures ?? 0)
          const updatedAt = Number(row.updatedAt ?? 0)
          return {
            providerId: String(row.providerId),
            label: String(row.label),
            requests,
            successes,
            failures,
            consecutiveFailures,
            errorRate: requests ? failures / requests * 100 : 0,
            averageLatencyMs: requests ? Number(row.totalLatencyMs ?? 0) / requests : 0,
            lastLatencyMs: Number(row.lastLatencyMs ?? 0),
            lastSuccessAt: Number(row.lastSuccessAt ?? 0),
            lastFailureAt: Number(row.lastFailureAt ?? 0),
            lastError: row.lastError ? String(row.lastError) : null,
            updatedAt,
            status: providerStatus({ requests, successes, consecutiveFailures, updatedAt }),
          }
        }) as OpsProviderHealth[]
    }

    if (tableExists(db, 'ops_group_control_requests')) {
      snapshot.requests = db.prepare(`SELECT id, action, group_jid AS groupJid, status, error,
        requested_at AS requestedAt, completed_at AS completedAt
        FROM ops_group_control_requests WHERE instance_key = ? ORDER BY requested_at DESC LIMIT 12`)
        .all(instanceKey).map((row: any) => ({
          id: Number(row.id), action: String(row.action), groupJid: row.groupJid ? String(row.groupJid) : null,
          status: String(row.status), error: row.error ? String(row.error) : null,
          requestedAt: Number(row.requestedAt), completedAt: row.completedAt ? Number(row.completedAt) : null,
        })) as OpsRequest[]
    }

    const ingress = snapshot.stages[0]
    const elapsedSeconds = ingress?.firstAt && ingress.lastAt > ingress.firstAt
      ? Math.max(1, (ingress.lastAt - ingress.firstAt) / 1000)
      : 1
    snapshot.summary = {
      throughputMps: ingress ? ingress.invocations / elapsedSeconds : 0,
      averageE2eUs: snapshot.stages.reduce((sum, stage) => sum + stage.avgUs, 0),
      processingNodes: snapshot.stages.length,
      auditedCommands: snapshot.commands.length,
      bottlenecks: snapshot.commands.filter((command) => command.status === 'slow' || command.status === 'critical').length,
    }
    return snapshot
  } catch {
    return empty(instanceKey)
  } finally {
    db.close()
  }
}
