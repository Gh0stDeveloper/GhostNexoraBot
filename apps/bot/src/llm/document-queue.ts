import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { downloadMessageMedia } from '../utils/message.js'
import type { WAMessage } from 'baileys'

export type LlmDocumentJob = {
  id: string
  filename: string
  path: string
  mimetype: string | null
  status: 'queued' | 'processing' | 'completed' | 'failed'
  createdAt: string
  startedAt?: string
  finishedAt?: string
  error?: string
  bytes?: number
}

type QueueState = { jobs: LlmDocumentJob[] }

const ROOT = path.resolve(config.dataDir, 'llm')
const INBOX = path.join(ROOT, 'inbox')
const PROCESSING = path.join(ROOT, 'processing')
const PROCESSED = path.join(ROOT, 'processed')
const FAILED = path.join(ROOT, 'failed')
const QUEUE_FILE = path.join(ROOT, 'document-queue.json')

function ensureDirs() {
  for (const dir of [INBOX, PROCESSING, PROCESSED, FAILED]) fs.mkdirSync(dir, { recursive: true })
}

function readState(): QueueState {
  ensureDirs()
  try {
    const state = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')) as Partial<QueueState>
    return { jobs: Array.isArray(state.jobs) ? state.jobs : [] }
  } catch {
    return { jobs: [] }
  }
}

function writeState(state: QueueState) {
  ensureDirs()
  const temp = `${QUEUE_FILE}.tmp`
  fs.writeFileSync(temp, JSON.stringify(state, null, 2))
  fs.renameSync(temp, QUEUE_FILE)
}

function safeFilename(name: string) {
  return name.replace(/[^\p{L}\p{N}._-]/gu, '_').trim().slice(0, 120) || 'document.txt'
}

function moveFile(from: string, toDir: string, preferredName: string) {
  ensureDirs()
  if (!fs.existsSync(from)) return null
  const base = safeFilename(preferredName)
  let target = path.join(toDir, base)
  if (fs.existsSync(target)) {
    const ext = path.extname(base)
    const stem = path.basename(base, ext)
    target = path.join(toDir, `${stem}-${Date.now()}${ext}`)
  }
  fs.renameSync(from, target)
  return target
}

export async function enqueueDocumentFromWhatsApp(message: WAMessage) {
  const media = await downloadMessageMedia(message)
  if (!media || media.kind !== 'document') {
    throw new Error(
      'No encontré un documento. Envía un PDF, DOCX o TXT con el comando en el caption, o responde al documento usando .llm add.',
    )
  }
  const filename = safeFilename(media.fileName || fallbackName(media.mimetype))
  const ext = path.extname(filename).toLowerCase()
  if (!['.pdf', '.docx', '.txt', '.md', '.json', '.csv', '.tsv', '.xml', '.html', '.htm'].includes(ext)) {
    throw new Error(`Formato no compatible: ${ext || 'sin extensión'}. Usa PDF, DOCX o TXT.`)
  }
  ensureDirs()
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const target = path.join(INBOX, `${id}-${filename}`)
  const temp = `${target}.part`
  fs.writeFileSync(temp, media.buffer)
  fs.renameSync(temp, target)
  const state = readState()
  const job: LlmDocumentJob = {
    id,
    filename,
    path: target,
    mimetype: media.mimetype ?? null,
    status: 'queued',
    createdAt: new Date().toISOString(),
    bytes: media.buffer.length,
  }
  state.jobs.push(job)
  writeState(state)
  return { ...job, bytes: media.buffer.length }
}

function fallbackName(mimetype?: string | null) {
  if (mimetype?.includes('pdf')) return 'document.pdf'
  if (mimetype?.includes('wordprocessingml') || mimetype?.includes('msword')) return 'document.docx'
  return 'document.txt'
}

export function getQueueState() {
  return readState()
}

export function getQueueStats() {
  const jobs = readState().jobs
  return {
    total: jobs.length,
    queued: jobs.filter((j) => j.status === 'queued').length,
    processing: jobs.filter((j) => j.status === 'processing').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  }
}

export function listJobsByStatus(status: LlmDocumentJob['status']) {
  return readState().jobs.filter((job) => job.status === status)
}

export function updateDocumentJob(id: string, patch: Partial<LlmDocumentJob>) {
  const state = readState()
  const job = state.jobs.find((item) => item.id === id)
  if (!job) return false
  Object.assign(job, patch)
  writeState(state)
  return true
}

/** Mueve un job a processing/ y marca status. */
export function markJobProcessing(id: string) {
  const state = readState()
  const job = state.jobs.find((item) => item.id === id)
  if (!job) return null
  const moved = moveFile(job.path, PROCESSING, `${job.id}-${job.filename}`)
  if (moved) job.path = moved
  job.status = 'processing'
  job.startedAt = new Date().toISOString()
  job.error = undefined
  writeState(state)
  return job
}

/** Tras ingest exitoso: mueve a processed/ y deja el archivo en corpus/. */
export function markJobCompleted(id: string, corpusPath: string) {
  const state = readState()
  const job = state.jobs.find((item) => item.id === id)
  if (!job) return null
  // archivo ya está en corpus; opcionalmente copiar referencia a processed/
  try {
    if (fs.existsSync(job.path) && path.dirname(job.path) !== path.dirname(corpusPath)) {
      moveFile(job.path, PROCESSED, `${job.id}-${job.filename}`)
    } else if (fs.existsSync(corpusPath)) {
      // dejar copia ligera de nombre en processed para auditoría
      const marker = path.join(PROCESSED, `${job.id}-${job.filename}.done`)
      fs.writeFileSync(marker, JSON.stringify({ id: job.id, corpusPath, at: new Date().toISOString() }, null, 2))
    }
  } catch {
    // no bloquear por fallo de archivo
  }
  job.path = corpusPath
  job.status = 'completed'
  job.finishedAt = new Date().toISOString()
  job.error = undefined
  writeState(state)
  return job
}

export function markJobFailed(id: string, error: string) {
  const state = readState()
  const job = state.jobs.find((item) => item.id === id)
  if (!job) return null
  try {
    if (fs.existsSync(job.path)) {
      const moved = moveFile(job.path, FAILED, `${job.id}-${job.filename}`)
      if (moved) job.path = moved
    }
  } catch {
    // ignore
  }
  job.status = 'failed'
  job.finishedAt = new Date().toISOString()
  job.error = error.slice(0, 500)
  writeState(state)
  return job
}

export function clearCompletedJobs() {
  const state = readState()
  const before = state.jobs.length
  state.jobs = state.jobs.filter((job) => job.status !== 'completed')
  writeState(state)
  return before - state.jobs.length
}

export function retryFailedJobs() {
  const state = readState()
  let count = 0
  for (const job of state.jobs) {
    if (job.status !== 'failed') continue
    try {
      if (fs.existsSync(job.path)) {
        const moved = moveFile(job.path, INBOX, `${job.id}-${job.filename}`)
        if (moved) job.path = moved
      }
    } catch {
      // ignore
    }
    job.status = 'queued'
    job.error = undefined
    job.startedAt = undefined
    job.finishedAt = undefined
    count++
  }
  writeState(state)
  return count
}

export const documentQueuePaths = { ROOT, INBOX, PROCESSING, PROCESSED, FAILED, QUEUE_FILE }
