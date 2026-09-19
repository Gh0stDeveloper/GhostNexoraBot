import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { runtime } from './runtime'
import { readOpsJobs, type WebOpsJob } from './ops-jobs'

export const UPDATE_STAGES = ['fetch', 'dependencies', 'build', 'migration', 'restart', 'healthcheck'] as const
export type UpdateStage = typeof UPDATE_STAGES[number]
export type UpdateRunStatus = 'idle' | 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled'

export type UpdateStatusFile = {
  schemaVersion: number
  jobId: string | null
  stage: UpdateStage
  status: UpdateRunStatus
  progress: number
  message: string | null
  error: string | null
  branch: string | null
  oldSha: string | null
  newSha: string | null
  version: string | null
  startedAt: number | null
  updatedAt: number | null
  completedAt: number | null
}

export type UpdateDashboardSnapshot = {
  installedVersion: string
  currentCommit: string
  branch: string
  latestVersion: string | null
  latestCommit: string | null
  updateAvailable: boolean | null
  changelog: string[]
  remoteError: string | null
  status: UpdateStatusFile
  job: WebOpsJob | null
  triggerInstalled: boolean
}

function rootDir() {
  return process.env.INSTALL_DIR || process.cwd()
}

function safeGit(args: string[]) {
  try {
    return execFileSync('git', args, {
      cwd: rootDir(),
      encoding: 'utf8',
      timeout: 8_000,
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function installedVersion() {
  try {
    const file = path.join(rootDir(), 'package.json')
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown }
    return String(parsed.version || 'unknown').slice(0, 80)
  } catch {
    return 'unknown'
  }
}

function normalizeStage(value: unknown): UpdateStage {
  return (UPDATE_STAGES as readonly string[]).includes(String(value)) ? value as UpdateStage : 'fetch'
}

function normalizeStatus(value: unknown): UpdateRunStatus {
  return ['idle', 'waiting', 'running', 'completed', 'failed', 'cancelled'].includes(String(value))
    ? value as UpdateRunStatus
    : 'idle'
}

function statusFile(): UpdateStatusFile {
  const file = path.join(runtime.dataDir, 'update-status.json')
  const empty: UpdateStatusFile = {
    schemaVersion: 1,
    jobId: null,
    stage: 'fetch',
    status: 'idle',
    progress: 0,
    message: null,
    error: null,
    branch: null,
    oldSha: null,
    newSha: null,
    version: null,
    startedAt: null,
    updatedAt: null,
    completedAt: null,
  }
  if (!existsSync(file)) return empty
  try {
    const row = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    return {
      schemaVersion: Math.max(1, Number(row.schemaVersion ?? 1)),
      jobId: row.jobId ? String(row.jobId).slice(0, 120) : null,
      stage: normalizeStage(row.stage),
      status: normalizeStatus(row.status),
      progress: Math.max(0, Math.min(100, Number(row.progress ?? 0))),
      message: row.message ? String(row.message).slice(0, 1200) : null,
      error: row.error ? String(row.error).slice(0, 6000) : null,
      branch: row.branch ? String(row.branch).slice(0, 120) : null,
      oldSha: row.oldSha ? String(row.oldSha).slice(0, 80) : null,
      newSha: row.newSha ? String(row.newSha).slice(0, 80) : null,
      version: row.version ? String(row.version).slice(0, 80) : null,
      startedAt: row.startedAt ? Number(row.startedAt) : null,
      updatedAt: row.updatedAt ? Number(row.updatedAt) : null,
      completedAt: row.completedAt ? Number(row.completedAt) : null,
    }
  } catch {
    return { ...empty, status: 'failed', error: 'update_status_file_invalid' }
  }
}

function remoteCommit(branch: string) {
  const ref = branch && branch !== 'HEAD' ? branch : 'main'
  const output = safeGit(['ls-remote', 'origin', `refs/heads/${ref}`])
  const sha = output.split(/\s+/)[0] || ''
  return /^[a-f0-9]{40}$/i.test(sha) ? sha : null
}

async function remotePackageVersion(sha: string | null) {
  if (!sha) return null
  try {
    const response = await fetch(
      `https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/${encodeURIComponent(sha)}/package.json`,
      { cache: 'no-store', signal: AbortSignal.timeout(6_000) },
    )
    if (!response.ok) return null
    const row = await response.json() as { version?: unknown }
    return row.version ? String(row.version).slice(0, 80) : null
  } catch {
    return null
  }
}

async function compareChangelog(current: string, latest: string | null) {
  if (!latest || current === latest || !/^[a-f0-9]{40}$/i.test(current)) return []
  try {
    const response = await fetch(
      `https://api.github.com/repos/Gh0stDeveloper/GhostNexoraBot/compare/${current}...${latest}`,
      {
        cache: 'no-store',
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'GhostNexoraBot-Dashboard/2.0' },
        signal: AbortSignal.timeout(8_000),
      },
    )
    if (!response.ok) return []
    const data = await response.json() as { commits?: Array<{ commit?: { message?: string } }> }
    return (data.commits ?? [])
      .slice(-12)
      .reverse()
      .map((item) => String(item.commit?.message ?? '').split('\n')[0]?.trim())
      .filter((item): item is string => Boolean(item))
      .map((item) => item.slice(0, 180))
  } catch {
    return []
  }
}

function triggerInstalled() {
  if (process.platform !== 'linux') return false
  return existsSync('/etc/systemd/system/ghost-nexora-update.path')
}

export async function readUpdateDashboard(): Promise<UpdateDashboardSnapshot> {
  const currentCommit = safeGit(['rev-parse', 'HEAD']) || 'unknown'
  const branch = safeGit(['branch', '--show-current']) || process.env.BRANCH || 'main'
  const latestCommit = remoteCommit(branch)
  const [latestVersion, changelog] = await Promise.all([
    remotePackageVersion(latestCommit),
    latestCommit ? compareChangelog(currentCommit, latestCommit) : Promise.resolve([]),
  ])
  const status = statusFile()
  const jobs = readOpsJobs('main', { type: 'update', limit: 20 }).rows
  const job = status.jobId
    ? jobs.find((item) => item.id === status.jobId) ?? jobs[0] ?? null
    : jobs[0] ?? null

  return {
    installedVersion: installedVersion(),
    currentCommit,
    branch,
    latestVersion,
    latestCommit,
    updateAvailable: latestCommit ? latestCommit !== currentCommit : null,
    changelog,
    remoteError: latestCommit ? null : 'remote_version_unavailable',
    status,
    job,
    triggerInstalled: triggerInstalled(),
  }
}
