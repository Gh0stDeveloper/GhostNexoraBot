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

export type OpsSnapshot = {
  instanceKey: string
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

function empty(instanceKey: string): OpsSnapshot {
  return {
    instanceKey,
    summary: { throughputMps: 0, averageE2eUs: 0, processingNodes: 7, auditedCommands: 0, bottlenecks: 0 },
    stages: STAGES.map(([id, name]) => ({ id, name, invocations: 0, minUs: 0, avgUs: 0, maxUs: 0, lastUs: 0, firstAt: 0, lastAt: 0, status: 'optimal' })),
    commands: [], groups: [], requests: [],
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
      snapshot.groups = db.prepare(`SELECT group_jid AS groupJid, name, participant_count AS participantCount,
        admin_count AS adminCount, announce, restrict_mode AS restrictMode, updated_at AS updatedAt
        FROM ops_groups WHERE instance_key = ? ORDER BY name COLLATE NOCASE ASC`)
        .all(instanceKey).map((row: any) => ({
          groupJid: String(row.groupJid), name: String(row.name), participantCount: Number(row.participantCount),
          adminCount: Number(row.adminCount), announce: Boolean(row.announce), restrictMode: Boolean(row.restrictMode), updatedAt: Number(row.updatedAt),
        })) as OpsGroup[]
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
