#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const temp = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-e11-jobs-'))
const dataDir = path.join(temp, 'data')
mkdirSync(dataDir, { recursive: true })

Object.assign(process.env, {
  ENV_FILE: path.join(temp, 'missing.env'),
  DATA_DIR: dataDir,
  SESSION_DIR: path.join(dataDir, 'session'),
  NEXORA_GLOBAL_CONTROL_DB: path.join(temp, 'control.sqlite'),
  NEXORA_GLOBAL_ECONOMY_DB: path.join(temp, 'economy.sqlite'),
  NEXORA_INSTANCE_ROLE: 'main',
  NEXORA_SUBBOT_ID: '',
  OWNER_NUMBERS: '',
  ADMIN_WEB_TOKEN: 'phase-e11-admin-secret',
  LEMPI_API_KEY: 'phase-e11-secret-api-key',
  OLLAMA_ENABLED: 'false',
  WEB_ENABLED: 'false',
})

try {
  const jobs = await import('../apps/bot/dist/services/ops-jobs.js')
  const { opsDb } = await import('../apps/bot/dist/services/ops-database.js')

  const tables = opsDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ops_jobs','ops_job_requests') ORDER BY name").all()
  assert.equal(tables.length, 2, 'E11 jobs tables missing')

  let cancelCalled = false
  const cancellable = jobs.createOpsJob({
    type: 'ffmpeg',
    label: 'FFmpeg smoke',
    source: 'phase-e11-smoke',
    cancellable: true,
  })
  cancellable.setCancelHandler(() => {
    cancelCalled = true
    return true
  })
  cancellable.start('running')
  cancellable.update(42, 'encoding')
  assert.equal(jobs.queueOpsJobAction({ jobId: cancellable.id, action: 'cancel', requestedBy: 'smoke' }), true)
  await jobs.processOpsJobRequests()
  assert.equal(cancelCalled, true, 'E11 cancel handler was not called')
  const cancelled = opsDb.prepare('SELECT status, progress FROM ops_jobs WHERE id = ?').get(cancellable.id)
  assert.equal(cancelled?.status, 'cancelled', 'E11 cancel request did not cancel job')
  assert.equal(Number(cancelled?.progress), 42, 'E11 cancellation must preserve latest progress')

  let retryJobId = ''
  const retryable = jobs.createOpsJob({
    type: 'update',
    label: 'Update smoke',
    source: 'phase-e11-smoke',
    retryable: true,
  })
  retryable.setRetryHandler(() => {
    const retry = jobs.createOpsJob({
      type: 'update',
      label: 'Update retry smoke',
      source: 'phase-e11-smoke',
      retryOf: retryable.id,
    })
    retryJobId = retry.id
    retry.start('retry_started')
    retry.complete('retry_completed')
    return retry.id
  })
  retryable.start('first_attempt')
  retryable.fail(new Error('first_attempt_failed'))
  assert.equal(jobs.queueOpsJobAction({ jobId: retryable.id, action: 'retry', requestedBy: 'smoke' }), true)
  await jobs.processOpsJobRequests()
  assert.ok(retryJobId.startsWith('job_'), 'E11 retry handler did not create a new job')
  const retryRequest = opsDb.prepare("SELECT status, result_job_id AS resultJobId FROM ops_job_requests WHERE job_id = ? AND action = 'retry' ORDER BY id DESC LIMIT 1").get(retryable.id)
  assert.equal(retryRequest?.status, 'completed', 'E11 retry request did not complete')
  assert.equal(retryRequest?.resultJobId, retryJobId, 'E11 retry result job id mismatch')
  const retryRow = opsDb.prepare('SELECT status, retry_of AS retryOf FROM ops_jobs WHERE id = ?').get(retryJobId)
  assert.equal(retryRow?.status, 'completed')
  assert.equal(retryRow?.retryOf, retryable.id)

  const secretJob = jobs.createOpsJob({
    type: 'download',
    label: 'Secret redaction smoke',
    source: 'phase-e11-smoke',
  })
  secretJob.start()
  secretJob.fail(new Error('token=phase-e11-secret-api-key'))
  const secretRow = opsDb.prepare('SELECT error FROM ops_jobs WHERE id = ?').get(secretJob.id)
  assert.ok(!String(secretRow?.error ?? '').includes('phase-e11-secret-api-key'), 'E11 persisted a secret in job error')
  assert.match(String(secretRow?.error ?? ''), /REDACTED/, 'E11 job error should be visibly redacted')

  const core = readFileSync(path.join(root, 'apps/bot/src/services/ops-jobs.ts'), 'utf8')
  const downloader = readFileSync(path.join(root, 'apps/bot/src/services/downloader.ts'), 'utf8')
  const progress = readFileSync(path.join(root, 'apps/bot/src/services/progress.ts'), 'utf8')
  const ollama = readFileSync(path.join(root, 'apps/bot/src/services/ollama.ts'), 'utf8')
  const v2 = readFileSync(path.join(root, 'apps/bot/src/commands/v2.ts'), 'utf8')
  const controlApi = readFileSync(path.join(root, 'apps/bot/src/services/control-api-v2.ts'), 'utf8')
  const webReader = readFileSync(path.join(root, 'apps/web/lib/ops-jobs.ts'), 'utf8')
  const dashboard = readFileSync(path.join(root, 'apps/web/components/jobs-dashboard.tsx'), 'utf8')
  const admin = readFileSync(path.join(root, 'apps/web/app/admin/page.tsx'), 'utf8')
  const subbot = readFileSync(path.join(root, 'apps/web/app/subbot/page.tsx'), 'utf8')
  const webControl = readFileSync(path.join(root, 'apps/web/app/api/control/route.ts'), 'utf8')
  const security = readFileSync(path.join(root, 'apps/web/lib/web-security.ts'), 'utf8')
  const roadmap = readFileSync(path.join(root, 'README_NEXT_INTEGRATIONS.md'), 'utf8')

  assert.match(core, /MAX_ROWS_PER_INSTANCE = 500/, 'E11 job row cap missing')
  assert.match(core, /RETENTION_MS = 7 \* 86_400_000/, 'E11 retention missing')
  assert.match(core, /runtime_restarted_or_job_stale/, 'E11 stale active-job recovery missing')
  assert.match(core, /processOpsJobRequests/, 'E11 action processor missing')

  assert.match(downloader, /runTrackedTool\('yt-dlp'/, 'E11 yt-dlp instrumentation missing')
  assert.match(downloader, /runTrackedTool\('ffmpeg'/, 'E11 FFmpeg instrumentation missing')
  assert.match(downloader, /child\.kill\('SIGTERM'\)/, 'E11 external process cancellation missing')
  assert.match(progress, /type: 'download'/, 'E11 parent download job missing')
  assert.match(ollama, /type: 'ai'/, 'E11 AI job missing')
  assert.match(ollama, /externalAbort\.abort\(\)/, 'E11 AI cancellation missing')
  assert.match(v2, /type: 'broadcast'/, 'E11 broadcast job missing')
  assert.match(controlApi, /type: 'update'/, 'E11 update job missing')
  assert.match(controlApi, /setRetryHandler/, 'E11 update retry capability missing')

  assert.match(webReader, /WHERE \$\{clauses\.join\(' AND '\)\}/, 'E11 web reader filters missing')
  assert.match(dashboard, /cancel_job/, 'E11 Cancel action missing')
  assert.match(dashboard, /retry_job/, 'E11 Retry action missing')
  assert.match(dashboard, /<details/, 'E11 View error disclosure missing')
  assert.match(admin, /section === 'jobs'/, 'E11 admin jobs section missing')
  assert.match(subbot, /section === 'jobs'/, 'E11 subbot jobs section missing')
  assert.match(webControl, /job_not_found_for_instance/, 'E11 instance-scoped action validation missing')
  assert.match(webControl, /ops_job_requests/, 'E11 web action queue missing')
  assert.match(security, /'jobs:view'/, 'E11 view permission missing')
  assert.match(security, /'jobs:manage'/, 'E11 manage permission missing')
  assert.match(roadmap, /## E11\. Jobs activos[\s\S]*Estado: (?:EN PROGRESO|TERMINADO)/, 'E11 roadmap status missing')

  console.log('Phase E11 active jobs smoke passed')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
