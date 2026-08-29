import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { downloadMessageMedia } from '../utils/message.js'
import type { WAMessage, WASocket } from 'baileys'

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
}

type QueueState = { jobs: LlmDocumentJob[] }

const ROOT = path.resolve(config.dataDir, 'llm')
const INBOX = path.join(ROOT, 'inbox')
const QUEUE_FILE = path.join(ROOT, 'document-queue.json')

function ensureDirs() {
  fs.mkdirSync(INBOX, { recursive: true })
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
  const cleaned = name.replace(/[^\p{L}\p{N}._-]/gu, '_').trim().slice(0, 120)
  return cleaned || 'document.txt'
}

export async function enqueueDocumentFromWhatsApp(socket: WASocket, message: WAMessage) {
  const media = await downloadMessageMedia(message)
  if (!media || media.kind !== 'document') {
    throw new Error('No encontré un documento. Envía un PDF, DOCX o TXT con el comando en el caption, o responde al documento usando .llm add.')
  }

  const filename = safeFilename(media.fileName || fallbackName(media.mimetype))
  const ext = path.extname(filename).toLowerCase()
  if (!['.pdf', '.docx', '.txt', '.md', '.json', '.csv', '.tsv', '.xml', '.html', '.htm'].includes(ext)) {
    throw new Error(`Formato no compatible: ${ext || 'sin extensión'}. Usa PDF, DOCX o TXT.`)
  }

  ensureDirs()
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const storedName = `${id}-${filename}`
  const target = path.join(INBOX, storedName)
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
  }
  state.jobs.push(job)
  writeState(state)
  return { ...job, bytes: media.buffer.length }
}

function fallbackName(mimetype?: string | null) {
  if (mimetype?.includes('pdf')) return 'document.pdf'
  if (mimetype?.includes('wordprocessingml')) return 'document.docx'
  return 'document.txt'
}

export function getQueueState() {
  return readState()
}

export function getQueueStats() {
  const jobs = readState().jobs
  return {
    total: jobs.length,
    queued: jobs.filter((job) => job.status === 'queued').length,
    processing: jobs.filter((job) => job.status === 'processing').length,
    completed: jobs.filter((job) => job.status === 'completed').length,
    failed: jobs.filter((job) => job.status === 'failed').length,
  }
}
