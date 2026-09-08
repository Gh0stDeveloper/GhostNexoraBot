import type { BotCommand } from '../types.js'
import { opsDb, opsInstanceKey } from './ops-database.js'

const now = () => Date.now()

export const PIPELINE_STAGES = [
  { id: '01', name: 'Ingesta Baileys', bottleneckUs: 50_000 },
  { id: '02', name: 'Serializador de Mensajes', bottleneckUs: 150_000 },
  { id: '03', name: 'Sincronización DB & State', bottleneckUs: 100_000 },
  { id: '04', name: 'Filtros & Permisos', bottleneckUs: 150_000 },
  { id: '05', name: 'Matcher & Cola de Ejecución', bottleneckUs: 100_000 },
  { id: '06', name: 'Ejecutor Sandbox Plugin', bottleneckUs: 750_000 },
  { id: '07', name: 'Despacho Socket Baileys', bottleneckUs: 250_000 },
] as const

opsDb.exec(`
  CREATE TABLE IF NOT EXISTS ops_pipeline_metrics (
    instance_key TEXT NOT NULL,
    stage_id TEXT NOT NULL,
    stage_name TEXT NOT NULL,
    invocations INTEGER NOT NULL DEFAULT 0,
    total_us INTEGER NOT NULL DEFAULT 0,
    min_us INTEGER NOT NULL DEFAULT 0,
    max_us INTEGER NOT NULL DEFAULT 0,
    last_us INTEGER NOT NULL DEFAULT 0,
    first_at INTEGER NOT NULL DEFAULT 0,
    last_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(instance_key, stage_id)
  );
  CREATE TABLE IF NOT EXISTS ops_command_catalog (
    instance_key TEXT NOT NULL,
    command_name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    registered_at INTEGER NOT NULL,
    PRIMARY KEY(instance_key, command_name)
  );
  CREATE TABLE IF NOT EXISTS ops_command_metrics (
    instance_key TEXT NOT NULL,
    command_name TEXT NOT NULL,
    invocations INTEGER NOT NULL DEFAULT 0,
    successes INTEGER NOT NULL DEFAULT 0,
    failures INTEGER NOT NULL DEFAULT 0,
    total_us INTEGER NOT NULL DEFAULT 0,
    min_us INTEGER NOT NULL DEFAULT 0,
    max_us INTEGER NOT NULL DEFAULT 0,
    last_us INTEGER NOT NULL DEFAULT 0,
    heap_delta_total INTEGER NOT NULL DEFAULT 0,
    first_at INTEGER NOT NULL DEFAULT 0,
    last_at INTEGER NOT NULL DEFAULT 0,
    last_error_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(instance_key, command_name)
  );
  CREATE INDEX IF NOT EXISTS idx_ops_command_metrics_instance_avg
    ON ops_command_metrics(instance_key, total_us DESC);
`)

type CommandAuditInput = Pick<BotCommand, 'name' | 'category' | 'description'>

function micros(durationMs: number) {
  if (!Number.isFinite(durationMs)) return 0
  return Math.max(0, Math.round(durationMs * 1000))
}

function commandStatus(avgUs: number, maxUs: number, successRate: number) {
  if (successRate < 90 || avgUs >= 2_000_000 || maxUs >= 5_000_000) return 'critical' as const
  if (avgUs >= 750_000 || maxUs >= 2_000_000 || successRate < 97) return 'slow' as const
  if (avgUs >= 250_000 || maxUs >= 1_000_000 || successRate < 99) return 'warning' as const
  return 'optimal' as const
}

export const performanceAudit = {
  registerCommands(commands: CommandAuditInput[], instanceKey = opsInstanceKey()) {
    const stamp = now()
    const statement = opsDb.prepare(`INSERT INTO ops_command_catalog(instance_key, command_name, category, description, registered_at)
      VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(instance_key, command_name) DO UPDATE SET
        category = excluded.category,
        description = excluded.description,
        registered_at = excluded.registered_at`)
    opsDb.exec('BEGIN IMMEDIATE')
    try {
      for (const command of commands) {
        statement.run(instanceKey, command.name.toLowerCase(), command.category, command.description, stamp)
      }
      opsDb.exec('COMMIT')
    } catch (error) {
      opsDb.exec('ROLLBACK')
      throw error
    }
  },

  recordStage(stageId: string, durationMs: number, instanceKey = opsInstanceKey()) {
    const stage = PIPELINE_STAGES.find((item) => item.id === stageId)
    if (!stage) return
    const value = micros(durationMs)
    const stamp = now()
    opsDb.prepare(`INSERT INTO ops_pipeline_metrics(
        instance_key, stage_id, stage_name, invocations, total_us, min_us, max_us, last_us, first_at, last_at
      ) VALUES(?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(instance_key, stage_id) DO UPDATE SET
        stage_name = excluded.stage_name,
        invocations = ops_pipeline_metrics.invocations + 1,
        total_us = ops_pipeline_metrics.total_us + excluded.total_us,
        min_us = CASE WHEN ops_pipeline_metrics.min_us = 0 THEN excluded.min_us ELSE MIN(ops_pipeline_metrics.min_us, excluded.min_us) END,
        max_us = MAX(ops_pipeline_metrics.max_us, excluded.max_us),
        last_us = excluded.last_us,
        first_at = CASE WHEN ops_pipeline_metrics.first_at = 0 THEN excluded.first_at ELSE ops_pipeline_metrics.first_at END,
        last_at = excluded.last_at`)
      .run(instanceKey, stage.id, stage.name, value, value, value, value, stamp, stamp)
  },

  recordCommand(command: CommandAuditInput, durationMs: number, success: boolean, heapDeltaBytes = 0, instanceKey = opsInstanceKey()) {
    const name = command.name.toLowerCase()
    const value = micros(durationMs)
    const stamp = now()
    const heap = Number.isFinite(heapDeltaBytes) ? Math.trunc(heapDeltaBytes) : 0
    opsDb.prepare(`INSERT INTO ops_command_catalog(instance_key, command_name, category, description, registered_at)
      VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(instance_key, command_name) DO UPDATE SET category = excluded.category, description = excluded.description`)
      .run(instanceKey, name, command.category, command.description, stamp)
    opsDb.prepare(`INSERT INTO ops_command_metrics(
        instance_key, command_name, invocations, successes, failures, total_us, min_us, max_us, last_us,
        heap_delta_total, first_at, last_at, last_error_at
      ) VALUES(?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(instance_key, command_name) DO UPDATE SET
        invocations = ops_command_metrics.invocations + 1,
        successes = ops_command_metrics.successes + excluded.successes,
        failures = ops_command_metrics.failures + excluded.failures,
        total_us = ops_command_metrics.total_us + excluded.total_us,
        min_us = CASE WHEN ops_command_metrics.min_us = 0 THEN excluded.min_us ELSE MIN(ops_command_metrics.min_us, excluded.min_us) END,
        max_us = MAX(ops_command_metrics.max_us, excluded.max_us),
        last_us = excluded.last_us,
        heap_delta_total = ops_command_metrics.heap_delta_total + excluded.heap_delta_total,
        first_at = CASE WHEN ops_command_metrics.first_at = 0 THEN excluded.first_at ELSE ops_command_metrics.first_at END,
        last_at = excluded.last_at,
        last_error_at = MAX(ops_command_metrics.last_error_at, excluded.last_error_at)`)
      .run(instanceKey, name, success ? 1 : 0, success ? 0 : 1, value, value, value, value, heap, stamp, stamp, success ? 0 : stamp)
  },

  snapshot(instanceKey = opsInstanceKey()) {
    const stageRows = opsDb.prepare(`SELECT stage_id AS stageId, stage_name AS stageName, invocations, total_us AS totalUs,
      min_us AS minUs, max_us AS maxUs, last_us AS lastUs, first_at AS firstAt, last_at AS lastAt
      FROM ops_pipeline_metrics WHERE instance_key = ?`).all(instanceKey) as Array<Record<string, number | string>>
    const byStage = new Map(stageRows.map((row) => [String(row.stageId), row]))
    const stages = PIPELINE_STAGES.map((stage) => {
      const row = byStage.get(stage.id)
      const invocations = Number(row?.invocations ?? 0)
      const totalUs = Number(row?.totalUs ?? 0)
      const avgUs = invocations ? Math.round(totalUs / invocations) : 0
      return {
        id: stage.id,
        name: stage.name,
        invocations,
        minUs: Number(row?.minUs ?? 0),
        avgUs,
        maxUs: Number(row?.maxUs ?? 0),
        lastUs: Number(row?.lastUs ?? 0),
        firstAt: Number(row?.firstAt ?? 0),
        lastAt: Number(row?.lastAt ?? 0),
        status: avgUs >= stage.bottleneckUs ? 'bottleneck' as const : 'optimal' as const,
      }
    })

    const rows = opsDb.prepare(`SELECT c.command_name AS commandName, c.category, c.description,
      COALESCE(m.invocations, 0) AS invocations, COALESCE(m.successes, 0) AS successes,
      COALESCE(m.failures, 0) AS failures, COALESCE(m.total_us, 0) AS totalUs,
      COALESCE(m.min_us, 0) AS minUs, COALESCE(m.max_us, 0) AS maxUs,
      COALESCE(m.last_us, 0) AS lastUs, COALESCE(m.heap_delta_total, 0) AS heapDeltaTotal,
      COALESCE(m.first_at, 0) AS firstAt, COALESCE(m.last_at, 0) AS lastAt,
      COALESCE(m.last_error_at, 0) AS lastErrorAt
      FROM ops_command_catalog c
      LEFT JOIN ops_command_metrics m ON m.instance_key = c.instance_key AND m.command_name = c.command_name
      WHERE c.instance_key = ?
      ORDER BY COALESCE(m.total_us * 1.0 / NULLIF(m.invocations, 0), 0) DESC, c.command_name ASC`)
      .all(instanceKey) as Array<Record<string, number | string>>
    const commands = rows.map((row) => {
      const invocations = Number(row.invocations ?? 0)
      const successes = Number(row.successes ?? 0)
      const avgUs = invocations ? Math.round(Number(row.totalUs ?? 0) / invocations) : 0
      const successRate = invocations ? (successes / invocations) * 100 : 100
      const maxUs = Number(row.maxUs ?? 0)
      return {
        commandName: String(row.commandName),
        category: String(row.category),
        description: String(row.description),
        invocations,
        successes,
        failures: Number(row.failures ?? 0),
        successRate,
        minUs: Number(row.minUs ?? 0),
        avgUs,
        maxUs,
        lastUs: Number(row.lastUs ?? 0),
        heapDeltaKb: invocations ? Math.round((Number(row.heapDeltaTotal ?? 0) / invocations) / 1024) : 0,
        firstAt: Number(row.firstAt ?? 0),
        lastAt: Number(row.lastAt ?? 0),
        lastErrorAt: Number(row.lastErrorAt ?? 0),
        status: commandStatus(avgUs, maxUs, successRate),
      }
    })

    const ingress = stages[0]
    const elapsedSeconds = ingress?.firstAt && ingress.lastAt > ingress.firstAt
      ? Math.max(1, (ingress.lastAt - ingress.firstAt) / 1000)
      : Math.max(1, process.uptime())
    const throughputMps = ingress ? ingress.invocations / elapsedSeconds : 0
    const averageE2eUs = stages.reduce((sum, stage) => sum + stage.avgUs, 0)
    const bottlenecks = commands.filter((command) => command.status === 'slow' || command.status === 'critical').length

    return {
      instanceKey,
      generatedAt: now(),
      summary: {
        throughputMps,
        averageE2eUs,
        processingNodes: PIPELINE_STAGES.length,
        auditedCommands: commands.length,
        bottlenecks,
      },
      stages,
      commands,
    }
  },

  reset(instanceKey = opsInstanceKey()) {
    opsDb.prepare('DELETE FROM ops_pipeline_metrics WHERE instance_key = ?').run(instanceKey)
    opsDb.prepare('DELETE FROM ops_command_metrics WHERE instance_key = ?').run(instanceKey)
  },
}
