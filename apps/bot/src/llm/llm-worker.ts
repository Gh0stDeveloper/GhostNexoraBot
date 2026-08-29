import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { prepareCorpusAndTrain } from './train.js'
import { getQueueState, updateDocumentJob } from './document-queue.js'
import { consumeTrainingRequest } from './training-queue.js'

const ROOT = path.resolve(config.dataDir, 'llm')
const INBOX = path.join(ROOT, 'inbox')
const CORPUS = path.join(ROOT, 'corpus', 'manual')
const POLL_MS = 2000
const AUTO_MS = 30 * 60 * 1000
let busy = false
let lastAuto = Date.now()

function ensureDirs() { fs.mkdirSync(INBOX, { recursive: true }); fs.mkdirSync(CORPUS, { recursive: true }) }

async function processDocuments() {
  const queued = getQueueState().jobs.filter((job) => job.status === 'queued')
  let moved = 0
  for (const job of queued) {
    updateDocumentJob(job.id, { status: 'processing', startedAt: new Date().toISOString(), error: undefined })
    try {
      if (!fs.existsSync(job.path)) throw new Error('El archivo recibido ya no existe.')
      const ext = path.extname(job.filename).toLowerCase()
      if (!['.pdf', '.docx', '.txt', '.md', '.json', '.csv', '.tsv', '.xml', '.html', '.htm'].includes(ext)) throw new Error(`Formato no compatible: ${ext || 'sin extensión'}`)
      const target = path.join(CORPUS, `${job.id}-${job.filename}`)
      fs.renameSync(job.path, target)
      updateDocumentJob(job.id, { path: target, status: 'completed', finishedAt: new Date().toISOString() })
      moved++
    } catch (error) {
      updateDocumentJob(job.id, { status: 'failed', finishedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) })
    }
  }
  return moved
}

async function runTraining() {
  if (busy) return null
  busy = true
  try { return await prepareCorpusAndTrain() }
  finally { busy = false }
}

async function tick() {
  ensureDirs()
  if (busy) return
  const moved = await processDocuments()
  const requested = consumeTrainingRequest()
  if (requested || moved > 0 || Date.now() - lastAuto >= AUTO_MS) {
    if (requested || moved > 0) await runTraining()
    else lastAuto = Date.now()
  }
  if (moved > 0 || requested) lastAuto = Date.now()
}

async function main() {
  ensureDirs()
  console.log('[LLM worker] iniciado; corpus y entrenamiento fuera del proceso WhatsApp')
  setInterval(() => void tick().catch((error) => console.error('[LLM worker] tick:', error)), POLL_MS).unref()
  await tick()
}

main().catch((error) => { console.error('[LLM worker] fatal:', error); process.exitCode = 1 })
