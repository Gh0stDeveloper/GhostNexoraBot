#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const root = process.cwd()
const temp = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-e12-update-'))
const dataDir = path.join(temp, 'data')
mkdirSync(dataDir, { recursive: true })
writeFileSync(path.join(temp, '.env'), 'LEMPİ_API_KEY=phase-e12-secret\nAPI_TOKEN=phase-e12-secret-token\n')

const db = new DatabaseSync(path.join(dataDir, 'ghostnexora.sqlite'))
db.exec(`
  CREATE TABLE ops_jobs (
    id TEXT PRIMARY KEY,
    instance_key TEXT NOT NULL,
    job_type TEXT NOT NULL,
    label TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL,
    detail TEXT,
    error TEXT,
    cancellable INTEGER NOT NULL,
    retryable INTEGER NOT NULL,
    retry_of TEXT,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    updated_at INTEGER NOT NULL
  );
`)
const jobId = 'job_phasee12smoke'
db.prepare(`INSERT INTO ops_jobs(
  id, instance_key, job_type, label, source, status, progress, detail, error,
  cancellable, retryable, retry_of, created_at, started_at, completed_at, updated_at
) VALUES(?, 'main', 'update', 'Smoke update', 'e12-smoke', 'waiting', 0, NULL, NULL, 0, 0, NULL, ?, NULL, NULL, ?)`)
  .run(jobId, Date.now(), Date.now())
db.close()

function progress(args) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/update-progress.mjs'), ...args], {
    cwd: root,
    env: {
      ...process.env,
      INSTALL_DIR: temp,
      STATE_DIR: temp,
      DATA_DIR: dataDir,
      UPDATE_JOB_ID: jobId,
    },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || 'update-progress failed')
}

try {
  progress([
    '--job-id', jobId,
    '--stage', 'build',
    '--status', 'running',
    '--progress', '55',
    '--message', 'building phase-e12-secret-token',
    '--branch', 'main',
    '--old-sha', 'a'.repeat(40),
    '--new-sha', 'b'.repeat(40),
    '--version', '2.0.1',
  ])

  let status = JSON.parse(readFileSync(path.join(dataDir, 'update-status.json'), 'utf8'))
  assert.equal(status.stage, 'build')
  assert.equal(status.status, 'running')
  assert.equal(status.progress, 55)
  assert.ok(!String(status.message).includes('phase-e12-secret-token'), 'E12 status message leaked configured secret')

  let check = new DatabaseSync(path.join(dataDir, 'ghostnexora.sqlite'))
  let row = check.prepare('SELECT status, progress, detail, error FROM ops_jobs WHERE id = ?').get(jobId)
  assert.equal(row?.status, 'running')
  assert.equal(Number(row?.progress), 55)
  check.close()

  progress([
    '--job-id', jobId,
    '--stage', 'build',
    '--status', 'failed',
    '--progress', '55',
    '--message', 'La actualización falló.',
    '--error', 'npm failed token=phase-e12-secret-token',
  ])

  status = JSON.parse(readFileSync(path.join(dataDir, 'update-status.json'), 'utf8'))
  assert.equal(status.status, 'failed')
  assert.ok(!String(status.error).includes('phase-e12-secret-token'), 'E12 failure leaked configured secret')
  assert.match(String(status.error), /REDACTED/, 'E12 error must remain diagnostic but sanitized')

  check = new DatabaseSync(path.join(dataDir, 'ghostnexora.sqlite'))
  row = check.prepare('SELECT status, progress, error, completed_at AS completedAt FROM ops_jobs WHERE id = ?').get(jobId)
  assert.equal(row?.status, 'failed')
  assert.ok(Number(row?.completedAt) > 0)
  check.close()

  const updater = readFileSync(path.join(root, 'scripts/update.sh'), 'utf8')
  const runner = readFileSync(path.join(root, 'scripts/update-request-runner.sh'), 'utf8')
  const writer = readFileSync(path.join(root, 'scripts/update-progress.mjs'), 'utf8')
  const reader = readFileSync(path.join(root, 'apps/web/lib/update-dashboard.ts'), 'utf8')
  const dashboard = readFileSync(path.join(root, 'apps/web/components/update-dashboard.tsx'), 'utf8')
  const admin = readFileSync(path.join(root, 'apps/web/app/admin/page.tsx'), 'utf8')
  const control = readFileSync(path.join(root, 'apps/web/app/api/control/route.ts'), 'utf8')
  const security = readFileSync(path.join(root, 'apps/web/lib/web-security.ts'), 'utf8')
  const systemCommand = readFileSync(path.join(root, 'apps/bot/src/commands/system.ts'), 'utf8')
  const controlApi = readFileSync(path.join(root, 'apps/bot/src/services/control-api-v2.ts'), 'utf8')
  const roadmap = readFileSync(path.join(root, 'README_NEXT_INTEGRATIONS.md'), 'utf8')

  for (const stage of ['fetch', 'dependencies', 'build', 'migration', 'restart', 'healthcheck']) {
    assert.match(updater, new RegExp(`update_progress ${stage} `), `E12 updater stage missing: ${stage}`)
  }
  assert.match(updater, /update_progress healthcheck completed 100/, 'E12 must finish at Healthcheck 100%')
  assert.match(updater, /\/health/, 'E12 must perform local HTTP healthcheck')
  assert.match(updater, /on_update_error/, 'E12 updater failure trap missing')
  assert.match(updater, /tail -n 40/, 'E12 must preserve useful real error context')
  assert.match(runner, /UPDATE_JOB_ID/, 'E12 runner must carry job ID')
  assert.match(runner, /update-progress\.mjs/, 'E12 runner must initialize persistent progress')
  assert.match(writer, /update-status\.json/, 'E12 persistent update status missing')
  assert.match(writer, /UPDATE ops_jobs/, 'E12 must synchronize updater progress into E11 jobs')

  assert.match(reader, /installedVersion/, 'E12 installed version reader missing')
  assert.match(reader, /rev-parse', 'HEAD'/, 'E12 current commit reader missing')
  assert.match(reader, /branch', '--show-current'/, 'E12 branch reader missing')
  assert.match(reader, /ls-remote/, 'E12 remote version detection missing')
  assert.match(reader, /compare\//, 'E12 changelog comparison missing')
  assert.match(reader, /update-status\.json/, 'E12 status file reader missing')
  assert.match(dashboard, /UPDATE_STAGES\.map/, 'E12 progress pipeline UI missing')
  assert.match(dashboard, /update\.errorReal/, 'E12 real updater error UI missing')
  assert.match(dashboard, /request_update/, 'E12 update action button missing')
  assert.match(admin, /section === 'updates'/, 'E12 admin section missing')
  assert.match(admin, /section !== 'updates'/, 'E12 updates section must force MainBot scope')
  assert.match(control, /action === 'request_update'/, 'E12 secure update request action missing')
  assert.match(control, /update_trigger_not_installed/, 'E12 privileged trigger validation missing')
  assert.match(control, /update_already_running/, 'E12 duplicate update protection missing')
  assert.match(control, /'request_update'\) return 'updates:manage'/, 'E12 permission mapping missing')
  assert.match(control, /'request_update'/, 'E12 fresh-auth control missing')
  assert.match(security, /'updates:view'/, 'E12 view permission missing')
  assert.match(security, /'updates:manage'/, 'E12 manage permission missing')
  assert.match(systemCommand, /jobId: job\.id/, 'WhatsApp updater must link to E12 job')
  assert.match(controlApi, /safe_update_request_queued/, 'Control API updater must remain linked to privileged runner')
  assert.doesNotMatch(control, /execFile|spawn\(|exec\(/, 'Web E12 update action must not execute shell commands')
  assert.match(roadmap, /## E12\. Actualizaciones desde Dashboard[\s\S]*Estado: (?:EN PROGRESO|TERMINADO)/, 'E12 roadmap status missing')

  console.log('Phase E12 dashboard updater smoke passed')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
