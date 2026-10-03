import os from 'node:os'
import { statfs } from 'node:fs/promises'
import { config } from '../config.js'
import { setOpsAlert, pruneResolvedAlerts } from './ops-alerts.js'
import { opsDb, opsInstanceKey } from './ops-database.js'
import { readAdapterMetrics, readQueueMetrics, recentAdapterRateLimitCount } from './ops-observability-metrics.js'
import { readPlatformRuntimeRegistry } from './platform-runtime-registry.js'
import { readProviderHealth } from './provider-health.js'
import { recordGroupedError } from './error-groups.js'

const CHECK_INTERVAL_MS = 30_000
const RECENT_JOB_WINDOW_MS = 15 * 60_000
let timer: NodeJS.Timeout | undefined
let checking = false

function recentFailedJobs(type: string) {
  try {
    const row = opsDb.prepare(`SELECT COUNT(*) AS count FROM ops_jobs
      WHERE instance_key = ? AND job_type = ? AND status = 'failed' AND updated_at >= ?`)
      .get(opsInstanceKey(), type, Date.now() - RECENT_JOB_WINDOW_MS) as { count?: number } | undefined
    return Number(row?.count ?? 0)
  } catch {
    return 0
  }
}

function recentDbLocked() {
  try {
    const row = opsDb.prepare(`SELECT COUNT(*) AS count FROM ops_runtime_logs
      WHERE instance_key = ? AND level = 'error' AND created_at >= ?
        AND (LOWER(message) LIKE '%database is locked%' OR LOWER(message) LIKE '%sqlite_busy%' OR LOWER(message) LIKE '%db locked%')`)
      .get(opsInstanceKey(), Date.now() - 10 * 60_000) as { count?: number } | undefined
    return Number(row?.count ?? 0)
  } catch { return 0 }
}

async function systemAlerts(instanceKey: string) {
  const memory = process.memoryUsage()
  const total = os.totalmem()
  const rssRatio = total > 0 ? memory.rss / total : 0
  setOpsAlert({
    key: 'system:memory-high',
    severity: rssRatio >= 0.9 ? 'critical' : 'warning',
    title: 'Memory usage is high',
    detail: `RSS ${Math.round(memory.rss / 1024 / 1024)} MB · ${(rssRatio * 100).toFixed(1)}% host memory`,
    active: rssRatio >= 0.8,
    instanceKey,
  })

  try {
    const fs = await statfs(config.dataDir)
    const totalBytes = Number(fs.blocks) * Number(fs.bsize)
    const availableBytes = Number(fs.bavail) * Number(fs.bsize)
    const freeRatio = totalBytes > 0 ? availableBytes / totalBytes : 1
    setOpsAlert({
      key: 'system:disk-low',
      severity: freeRatio <= 0.05 ? 'critical' : 'warning',
      title: 'Disk space is low',
      detail: `${(availableBytes / 1024 / 1024 / 1024).toFixed(2)} GB available · ${(freeRatio * 100).toFixed(1)}% free`,
      active: freeRatio <= 0.1 || availableBytes <= 2 * 1024 ** 3,
      instanceKey,
    })
  } catch (error) {
    recordGroupedError(error, { platform: undefined, instanceKey })
  }
}

export async function evaluateOperationalHealth() {
  if (checking) return
  checking = true
  const instanceKey = opsInstanceKey()
  try {
    const platforms = readPlatformRuntimeRegistry(instanceKey)
    const adapters = readAdapterMetrics(instanceKey)
    const queues = readQueueMetrics(instanceKey)
    const providers = readProviderHealth(instanceKey)

    const discord = platforms.find((row) => row.platform === 'discord')
    setOpsAlert({
      key: 'discord:reconnect-storm',
      severity: (discord?.reconnects ?? 0) >= 10 ? 'critical' : 'warning',
      title: 'Discord Gateway reconnecting repeatedly',
      detail: discord ? `${discord.reconnects} reconnects · state=${discord.state}` : null,
      active: Boolean(discord && discord.state === 'reconnecting' && discord.reconnects >= 5),
      instanceKey,
    })

    for (const provider of providers) {
      setOpsAlert({
        key: `provider:${provider.providerId}:offline-f5`,
        severity: provider.consecutiveFailures >= 5 ? 'critical' : 'warning',
        title: `${provider.label} provider offline`,
        detail: `${provider.consecutiveFailures} consecutive failures · latency=${Math.round(provider.lastLatencyMs)}ms`,
        active: provider.consecutiveFailures >= 3,
        instanceKey,
      })
    }

    const recentRateLimits = recentAdapterRateLimitCount(instanceKey, 10 * 60_000)
    setOpsAlert({
      key: 'platform:rate-limits',
      severity: recentRateLimits >= 25 ? 'critical' : 'warning',
      title: 'Platform rate limits detected',
      detail: `${recentRateLimits} rate-limit events in the last 10 minutes`,
      active: recentRateLimits >= 5,
      instanceKey,
    })

    const saturationCutoff = Date.now() - 10 * 60_000
    const saturated = queues.filter((row) =>
      row.currentDepth >= 3 ||
      row.lastWaitMs >= 5_000 ||
      (row.lastSaturatedAt >= saturationCutoff && row.maxDepth >= 2),
    )
    setOpsAlert({
      key: 'runtime:queue-saturation',
      severity: saturated.some((row) => row.maxWaitMs >= 15_000) ? 'critical' : 'warning',
      title: 'Execution queue saturation detected',
      detail: saturated.slice(0, 5).map((row) => `${row.dimensionType}:${row.dimensionId} depth=${row.currentDepth} wait=${Math.round(row.lastWaitMs)}ms`).join(' · '),
      active: saturated.length > 0,
      instanceKey,
    })

    const slowAdapters = adapters.filter((row) => row.lastLatencyMs >= 5_000 || row.averageLatencyMs >= 3_000)
    setOpsAlert({
      key: 'platform:critical-latency',
      severity: slowAdapters.some((row) => row.lastLatencyMs >= 15_000) ? 'critical' : 'warning',
      title: 'Platform delivery latency is high',
      detail: slowAdapters.map((row) => `${row.platform}=${Math.round(row.lastLatencyMs)}ms`).join(' · '),
      active: slowAdapters.length > 0,
      instanceKey,
    })

    const ffmpegFailures = recentFailedJobs('ffmpeg')
    const downloadFailures = recentFailedJobs('yt-dlp') + recentFailedJobs('download')
    setOpsAlert({
      key: 'jobs:ffmpeg-failures',
      severity: ffmpegFailures >= 5 ? 'critical' : 'warning',
      title: 'FFmpeg jobs are failing',
      detail: `${ffmpegFailures} failures in the last 15 minutes`,
      active: ffmpegFailures >= 2,
      instanceKey,
    })
    setOpsAlert({
      key: 'jobs:ytdlp-failures',
      severity: downloadFailures >= 8 ? 'critical' : 'warning',
      title: 'Download jobs are failing',
      detail: `${downloadFailures} yt-dlp/download failures in the last 15 minutes`,
      active: downloadFailures >= 3,
      instanceKey,
    })

    const locked = recentDbLocked()
    setOpsAlert({
      key: 'database:locked',
      severity: locked >= 5 ? 'critical' : 'warning',
      title: 'Database lock contention detected',
      detail: `${locked} lock errors in the last 10 minutes`,
      active: locked > 0,
      instanceKey,
    })

    await systemAlerts(instanceKey)
    pruneResolvedAlerts()
  } finally {
    checking = false
  }
}

export function startOperationalHealthMonitor() {
  if (timer) return
  void evaluateOperationalHealth()
  timer = setInterval(() => void evaluateOperationalHealth(), CHECK_INTERVAL_MS)
  timer.unref?.()
}

export function stopOperationalHealthMonitor() {
  if (!timer) return
  clearInterval(timer)
  timer = undefined
}
