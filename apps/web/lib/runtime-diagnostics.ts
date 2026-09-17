import { openBotDb } from './runtime'

export type RuntimeDiagnostics = {
  rssBytes: number
  heapUsedBytes: number
  heapTotalBytes: number
  externalBytes: number
  arrayBuffersBytes: number
  cpuPercent: number
  uptimeSeconds: number
  ollamaEnabled: boolean
  nodeVersion: string
  pid: number
  updatedAt: number
  fresh: boolean
}

export function readRuntimeDiagnostics(instanceKey: string): RuntimeDiagnostics | null {
  const db = openBotDb()
  if (!db) return null
  try {
    const exists = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ops_runtime_diagnostics'").get())
    if (!exists) return null
    const row = db.prepare(`SELECT
        rss_bytes AS rssBytes,
        heap_used_bytes AS heapUsedBytes,
        heap_total_bytes AS heapTotalBytes,
        external_bytes AS externalBytes,
        array_buffers_bytes AS arrayBuffersBytes,
        cpu_percent AS cpuPercent,
        uptime_seconds AS uptimeSeconds,
        ollama_enabled AS ollamaEnabled,
        node_version AS nodeVersion,
        pid,
        updated_at AS updatedAt
      FROM ops_runtime_diagnostics WHERE instance_key = ?`).get(instanceKey) as Record<string, string | number> | undefined
    if (!row) return null
    const updatedAt = Number(row.updatedAt ?? 0)
    return {
      rssBytes: Number(row.rssBytes ?? 0),
      heapUsedBytes: Number(row.heapUsedBytes ?? 0),
      heapTotalBytes: Number(row.heapTotalBytes ?? 0),
      externalBytes: Number(row.externalBytes ?? 0),
      arrayBuffersBytes: Number(row.arrayBuffersBytes ?? 0),
      cpuPercent: Number(row.cpuPercent ?? 0),
      uptimeSeconds: Number(row.uptimeSeconds ?? 0),
      ollamaEnabled: Boolean(row.ollamaEnabled),
      nodeVersion: String(row.nodeVersion ?? ''),
      pid: Number(row.pid ?? 0),
      updatedAt,
      fresh: updatedAt > 0 && Date.now() - updatedAt < 45_000,
    }
  } catch {
    return null
  } finally {
    db.close()
  }
}
