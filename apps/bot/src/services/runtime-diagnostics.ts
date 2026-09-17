import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { opsDb, opsInstanceKey } from './ops-database.js'

const instanceKey = opsInstanceKey()
let timer: NodeJS.Timeout | null = null
let previousCpu = process.cpuUsage()
let previousClock = process.hrtime.bigint()

opsDb.exec(`
  CREATE TABLE IF NOT EXISTS ops_runtime_diagnostics (
    instance_key TEXT PRIMARY KEY,
    rss_bytes INTEGER NOT NULL DEFAULT 0,
    heap_used_bytes INTEGER NOT NULL DEFAULT 0,
    heap_total_bytes INTEGER NOT NULL DEFAULT 0,
    external_bytes INTEGER NOT NULL DEFAULT 0,
    array_buffers_bytes INTEGER NOT NULL DEFAULT 0,
    cpu_percent REAL NOT NULL DEFAULT 0,
    uptime_seconds INTEGER NOT NULL DEFAULT 0,
    ollama_enabled INTEGER NOT NULL DEFAULT 0,
    node_version TEXT NOT NULL,
    pid INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
`)

function sampleCpuPercent() {
  const nowClock = process.hrtime.bigint()
  const nowCpu = process.cpuUsage()
  const elapsedUs = Number(nowClock - previousClock) / 1000
  const cpuUs = (nowCpu.user - previousCpu.user) + (nowCpu.system - previousCpu.system)
  previousClock = nowClock
  previousCpu = nowCpu
  if (!Number.isFinite(elapsedUs) || elapsedUs <= 0) return 0
  return Math.max(0, Math.min(999, cpuUs / elapsedUs * 100))
}

function persistSample() {
  try {
    const memory = process.memoryUsage()
    const cpuPercent = sampleCpuPercent()
    opsDb.prepare(`INSERT INTO ops_runtime_diagnostics(
        instance_key, rss_bytes, heap_used_bytes, heap_total_bytes, external_bytes,
        array_buffers_bytes, cpu_percent, uptime_seconds, ollama_enabled, node_version, pid, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(instance_key) DO UPDATE SET
        rss_bytes = excluded.rss_bytes,
        heap_used_bytes = excluded.heap_used_bytes,
        heap_total_bytes = excluded.heap_total_bytes,
        external_bytes = excluded.external_bytes,
        array_buffers_bytes = excluded.array_buffers_bytes,
        cpu_percent = excluded.cpu_percent,
        uptime_seconds = excluded.uptime_seconds,
        ollama_enabled = excluded.ollama_enabled,
        node_version = excluded.node_version,
        pid = excluded.pid,
        updated_at = excluded.updated_at`)
      .run(
        instanceKey,
        memory.rss,
        memory.heapUsed,
        memory.heapTotal,
        memory.external,
        memory.arrayBuffers,
        cpuPercent,
        Math.floor(process.uptime()),
        config.ollamaEnabled ? 1 : 0,
        process.version,
        process.pid,
        Date.now(),
      )
  } catch (error) {
    logger.debug({ error, instanceKey }, 'runtime diagnostics sample skipped')
  }
}

export function startRuntimeDiagnostics() {
  if (timer) return
  persistSample()
  timer = setInterval(persistSample, 10_000)
  timer.unref?.()
}

export function stopRuntimeDiagnosticsForTests() {
  if (timer) clearInterval(timer)
  timer = null
}
