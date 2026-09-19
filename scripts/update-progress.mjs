#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const args = process.argv.slice(2)
function arg(name, fallback = '') {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] !== undefined ? String(args[index + 1]) : fallback
}

const installDir = process.env.INSTALL_DIR || process.cwd()
const stateDir = process.env.STATE_DIR || '/var/lib/ghost-nexora-bot'
const dataDir = process.env.DATA_DIR || path.join(stateDir, 'data')
const statusFile = path.join(dataDir, 'update-status.json')
const envFile = path.join(installDir, '.env')
mkdirSync(dataDir, { recursive: true })
const now = Date.now()

function envSecrets() {
  if (!existsSync(envFile)) return []
  const rows = []
  for (const raw of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index < 1) continue
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()
    if (!value || value.length < 6) continue
    if (/(TOKEN|KEY|SECRET|PASSWORD|COOKIE|SESSION|AUTH|CREDENTIAL)/i.test(key)) rows.push(value)
  }
  return rows
}

const secrets = envSecrets()
function sanitize(value, max = 5000) {
  let next = String(value ?? '').replace(/\u0000/g, '')
  for (const secret of secrets) next = next.split(secret).join('[REDACTED]')
  next = next
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]{8,}\b/gi, '$1 [REDACTED]')
    .replace(/([?&](?:key|token|apikey|api_key|access_token|auth|authorization|secret|password|session|sid|cookie)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]')
    .trim()
  return next.slice(0, max)
}

function existingState() {
  try {
    if (!existsSync(statusFile)) return {}
    const parsed = JSON.parse(readFileSync(statusFile, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const stage = arg('stage', 'fetch')
const status = arg('status', 'running')
const progress = Math.max(0, Math.min(100, Math.round(Number(arg('progress', '0')) || 0)))
const jobId = arg('job-id', process.env.UPDATE_JOB_ID || '')
const message = sanitize(arg('message'), 1200)
const error = sanitize(arg('error'), 6000)
const branch = sanitize(arg('branch', process.env.BRANCH || ''), 120)
const oldSha = sanitize(arg('old-sha'), 80)
const newSha = sanitize(arg('new-sha'), 80)
const version = sanitize(arg('version'), 80)
const previous = existingState()

const next = {
  schemaVersion: 1,
  jobId: jobId || previous.jobId || null,
  stage,
  status,
  progress,
  message: message || null,
  error: error || null,
  branch: branch || previous.branch || null,
  oldSha: oldSha || previous.oldSha || null,
  newSha: newSha || previous.newSha || null,
  version: version || previous.version || null,
  startedAt: previous.startedAt || now,
  updatedAt: now,
  completedAt: status === 'completed' || status === 'failed' || status === 'cancelled' ? now : null,
}

const tempFile = `${statusFile}.tmp-${process.pid}`
writeFileSync(tempFile, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
renameSync(tempFile, statusFile)

const dbFile = path.join(dataDir, 'ghostnexora.sqlite')
if (next.jobId && existsSync(dbFile)) {
  try {
    const db = new DatabaseSync(dbFile)
    db.exec('PRAGMA busy_timeout = 5000;')
    const hasJobs = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ops_jobs'").get()
    if (hasJobs) {
      const jobStatus = status === 'completed' ? 'completed'
        : status === 'failed' ? 'failed'
          : status === 'cancelled' ? 'cancelled'
            : status === 'waiting' ? 'waiting'
              : 'running'
      const completedAt = ['completed', 'failed', 'cancelled'].includes(jobStatus) ? now : null
      db.prepare(`UPDATE ops_jobs
        SET status = ?, progress = ?, detail = ?, error = ?, started_at = COALESCE(started_at, ?),
            completed_at = ?, updated_at = ?
        WHERE id = ? AND instance_key = 'main'`).run(
          jobStatus,
          progress,
          message || stage,
          error || null,
          now,
          completedAt,
          now,
          next.jobId,
        )
    }
    db.close()
  } catch {
    // update-status.json remains the source of truth even if SQLite is temporarily unavailable.
  }
}
