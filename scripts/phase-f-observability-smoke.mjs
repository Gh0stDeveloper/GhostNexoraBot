#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-phase-f-'))
process.env.DATA_DIR = temp
process.env.SESSION_DIR = path.join(temp, 'session')
process.env.OLLAMA_ENABLED = 'false'
process.env.WEB_ENABLED = 'false'
process.env.ADMIN_WEB_TOKEN = 'phase-f-super-secret-token'
delete process.env.NEXORA_SUBBOT_ID

const source = (file) => readFile(path.join(root, file), 'utf8')

try {
  const { opsDb } = await import('../apps/bot/dist/services/ops-database.js')
  const {
    updatePlatformRuntime,
    recordPlatformRuntimeEvent,
    readPlatformRuntimeRegistry,
  } = await import('../apps/bot/dist/services/platform-runtime-registry.js')
  const {
    recordQueueObservation,
    readQueueMetrics,
    recordAdapterOperation,
    recordAdapterRetry,
    readAdapterMetrics,
    recentAdapterRateLimitCount,
  } = await import('../apps/bot/dist/services/ops-observability-metrics.js')
  const {
    withTraceContext,
    currentCorrelationId,
  } = await import('../apps/bot/dist/services/trace-context.js')
  const { trackedProviderCall } = await import('../apps/bot/dist/services/provider-health.js')
  const { recordGroupedError, readErrorGroups } = await import('../apps/bot/dist/services/error-groups.js')
  const { evaluateOperationalHealth } = await import('../apps/bot/dist/services/operational-health.js')

  updatePlatformRuntime('whatsapp', { state: 'running', latencyMs: 12, eventCount: 10, groupCount: 3 })
  recordPlatformRuntimeEvent('discord', { state: 'running', latencyMs: 8, groupCount: 4 })
  recordPlatformRuntimeEvent('telegram', { state: 'running', latencyMs: 5 })
  const runtimes = readPlatformRuntimeRegistry()
  assert.deepEqual(runtimes.map((row) => row.platform), ['discord', 'telegram', 'whatsapp'])
  assert.equal(runtimes.find((row) => row.platform === 'whatsapp')?.groupCount, 3, 'F1 WhatsApp group count missing')
  assert.equal(runtimes.find((row) => row.platform === 'discord')?.groupCount, 4, 'F1 Discord guild count missing')
  assert.equal(runtimes.find((row) => row.platform === 'telegram')?.state, 'running', 'F1 Telegram runtime state missing')

  recordQueueObservation({
    platform: 'whatsapp',
    command: 'ytmp4',
    provider: 'lempi',
    lane: 'downloads',
    waitMs: 125,
    executionMs: 850,
    failed: false,
    retries: 1,
    saturated: true,
    depth: 4,
  })
  const queueRows = readQueueMetrics()
  const commandQueue = queueRows.find((row) => row.dimensionType === 'command' && row.dimensionId === 'ytmp4')
  assert.ok(commandQueue, 'F2 command queue dimension missing')
  assert.equal(commandQueue.currentDepth, 4, 'F2 queue depth missing')
  assert.equal(commandQueue.maxDepth, 4, 'F2 max queue depth missing')
  assert.equal(commandQueue.retries, 1, 'F2 retry metric missing')
  assert.ok(commandQueue.lastSaturatedAt > 0, 'F2 saturation timestamp missing')
  assert.ok(queueRows.some((row) => row.dimensionType === 'provider' && row.dimensionId === 'lempi'), 'F2 provider dimension missing')
  assert.ok(queueRows.some((row) => row.dimensionType === 'lane' && row.dimensionId === 'downloads'), 'F2 download lane dimension missing')

  recordAdapterOperation('whatsapp', { ok: true, operation: 'send', latencyMs: 40 })
  recordAdapterOperation('discord', { ok: false, operation: 'edit', latencyMs: 75, error: new Error('synthetic edit failure') })
  recordAdapterOperation('telegram', { ok: false, operation: 'typing', latencyMs: 20, error: new Error('synthetic typing failure') })
  for (let index = 0; index < 5; index += 1) recordAdapterRetry('discord', { rateLimited: true })
  const adapters = readAdapterMetrics()
  assert.equal(adapters.find((row) => row.platform === 'whatsapp')?.sent, 1, 'F3 sent metric missing')
  assert.equal(adapters.find((row) => row.platform === 'discord')?.editFailures, 1, 'F3 edit failure missing')
  assert.equal(adapters.find((row) => row.platform === 'telegram')?.typingFailures, 1, 'F3 typing failure missing')
  assert.equal(recentAdapterRateLimitCount(), 5, 'F3/F5 recent rate-limit events missing')

  await withTraceContext({
    correlationId: 'phase-f-correlation-001',
    platform: 'whatsapp',
    botInstanceId: 'main',
    command: 'providerprobe',
  }, async () => {
    assert.equal(currentCorrelationId(), 'phase-f-correlation-001')
    await trackedProviderCall('phase-f-provider', async () => {
      assert.equal(currentCorrelationId(), 'phase-f-correlation-001')
      return 'ok'
    }, { useCircuitBreaker: false })
    recordGroupedError(new Error('provider timeout request 123456'), { provider: 'phase-f-provider' })
    recordGroupedError(new Error('provider timeout request 654321'), { provider: 'phase-f-provider' })
  })

  const providerMetric = readQueueMetrics().find((row) => row.dimensionType === 'provider' && row.dimensionId === 'phase-f-provider')
  assert.ok(providerMetric, 'F2 provider execution telemetry missing')
  const grouped = readErrorGroups().find((row) => row.provider === 'phase-f-provider')
  assert.ok(grouped, 'F6 grouped error missing')
  assert.equal(grouped.count, 2, 'F6 equivalent normalized errors must share a fingerprint')
  assert.equal(grouped.lastCorrelationId, 'phase-f-correlation-001', 'F4 correlation id did not reach error grouping')

  recordGroupedError(new Error('secret phase-f-super-secret-token should be redacted'), { platform: 'whatsapp' })
  const secretGroup = readErrorGroups().find((row) => row.sample.toLowerCase().includes('secret'))
  assert.ok(secretGroup, 'F6 sanitization probe missing')
  assert.equal(secretGroup.sample.includes('phase-f-super-secret-token'), false, 'F6 leaked configured secret')

  await evaluateOperationalHealth()
  const rateAlert = opsDb.prepare("SELECT status, detail FROM ops_alerts WHERE instance_key = 'main' AND alert_key = 'platform:rate-limits'")
    .get()
  assert.equal(rateAlert?.status, 'open', 'F5 recent 429 alert must open')
  assert.match(String(rateAlert?.detail ?? ''), /last 10 minutes/, 'F5 rate-limit alert must use a recent window')

  const [
    traceSource,
    runtimeSource,
    queueSource,
    metricSource,
    providerSource,
    mediaSource,
    outboxSource,
    waAdapter,
    discordAdapter,
    telegramAdapter,
    healthSource,
    errorSource,
    mainSource,
    waRouter,
    discordRouter,
    telegramRouter,
    webObs,
    diagnostics,
    roadmap,
  ] = await Promise.all([
    source('apps/bot/src/services/trace-context.ts'),
    source('apps/bot/src/services/platform-runtime-registry.ts'),
    source('apps/bot/src/services/execution-queues.ts'),
    source('apps/bot/src/services/ops-observability-metrics.ts'),
    source('apps/bot/src/services/provider-health.ts'),
    source('apps/bot/src/services/media-pipeline.ts'),
    source('apps/bot/src/services/delivery-outbox.ts'),
    source('apps/bot/src/platform/whatsapp/adapter.ts'),
    source('apps/bot/src/platform/discord/adapter.ts'),
    source('apps/bot/src/platform/telegram/adapter.ts'),
    source('apps/bot/src/services/operational-health.ts'),
    source('apps/bot/src/services/error-groups.ts'),
    source('apps/bot/src/index.ts'),
    source('apps/bot/src/core/router.ts'),
    source('apps/bot/src/platform/discord/router.ts'),
    source('apps/bot/src/platform/telegram/router.ts'),
    source('apps/web/lib/ops-observability.ts'),
    source('apps/web/components/developer-diagnostics.tsx'),
    source('README_NEXT_INTEGRATIONS.md'),
  ])

  assert.match(runtimeSource, /CREATE TABLE IF NOT EXISTS ops_platform_runtime/, 'F1 runtime registry table missing')
  assert.match(queueSource, /recordQueueObservation/, 'F2 execution queues are not instrumented')
  assert.match(metricSource, /current_depth/, 'F2 queue depth persistence missing')
  assert.match(metricSource, /ops_adapter_metrics/, 'F3 adapter metric table missing')
  for (const adapter of [waAdapter, discordAdapter, telegramAdapter]) {
    assert.match(adapter, /trackedAdapterOperation/, 'F3 platform adapter is not instrumented')
  }

  assert.match(traceSource, /AsyncLocalStorage/, 'F4 AsyncLocalStorage trace context missing')
  assert.match(mainSource, /withTraceContext/, 'F4 ingest trace missing')
  assert.match(waRouter, /withTraceContext/, 'F4 WhatsApp router trace missing')
  assert.match(discordRouter, /withTraceContext/, 'F4 Discord router trace missing')
  assert.match(telegramRouter, /withTraceContext/, 'F4 Telegram router trace missing')
  assert.match(providerSource, /withTraceFields/, 'F4 provider trace propagation missing')
  assert.match(mediaSource, /currentCorrelationId/, 'F4 media trace propagation missing')
  assert.match(outboxSource, /currentCorrelationId/, 'F4 outbox trace propagation missing')

  for (const alert of ['rate-limits', 'provider', 'reconnect-storm', 'queue-saturation', 'ffmpeg', 'ytdlp', 'database:locked', 'critical-latency', 'disk-low', 'memory-high']) {
    assert.ok(healthSource.includes(alert), 'F5 alert family missing: ' + alert)
  }
  assert.match(mainSource, /startOperationalHealthMonitor/, 'F5 health monitor is not started')

  assert.match(errorSource, /CREATE TABLE IF NOT EXISTS ops_error_groups/, 'F6 error group table missing')
  assert.match(errorSource, /createHash\('sha256'\)/, 'F6 SHA-256 fingerprint missing')
  assert.match(webObs, /readErrorGroups/, 'F6 Web reader missing')
  assert.match(diagnostics, /errorGroups/, 'F6 Diagnostics rendering missing')
  assert.match(diagnostics, /queueMetrics/, 'F2 Diagnostics rendering missing')
  assert.match(diagnostics, /adapterMetrics/, 'F3 Diagnostics rendering missing')
  assert.match(diagnostics, /platformRuntime/, 'F1 Diagnostics rendering missing')

  for (const phase of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6']) {
    assert.match(roadmap, new RegExp('## ' + phase + '\\.[\\s\\S]*?Estado: TERMINADO'), phase + ' roadmap status is not TERMINADO')
  }
  assert.match(roadmap, /Fase F \| Observabilidad, métricas y operación \| TERMINADO/, 'Phase F summary is not TERMINADO')

  console.log('Phase F1-F6 observability, metrics and operation smoke passed')
} finally {
  await rm(temp, { recursive: true, force: true })
}
