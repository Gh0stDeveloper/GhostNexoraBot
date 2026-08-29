import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { prepareCorpusAndTrain } from './train.js'
import { getQueueState, updateDocumentJob } from './document-queue.js'

const ROOT = path.resolve(config.dataDir, 'llm')
const INBOX = path.join(ROOT, 'inbox')
const CORPUS = path.join(ROOT, 'corpus', 'manual')
const POLL_MS = 2000

let running = false

function ensureDirs() {
  fs.mkdirSync(INBOX, { recursive: true })
  fs.mkdirSync(CORPUS, { recursive: true })
}

async function processQueue() {
  ensureDirs()
  if (running) return
  running = true
  try {
    const queued = getQueueState().jobs.filter((job) => job.status === 'queued')
    if (!queued.length) return

    for (const job of queued) {
      updateDocumentJob(job.id, { status: 'processing', startedAt: new Date().toISOString(), error: undefined })
      try {
        if (!fs.existsSync(job.path)) throw new Error('El archivo de la bandeja de entrada ya no existe.')
        const ext = path.extname(job.filename).toLowerCase()
        const target = path.join(CORPUS, `${job.id}-${job.filename}`)
        if (!['.pdf', '.docx', '.txt', '.md', '.json', '.csv', '.tsv', '.xml', '.html', '.htm'].includes(ext)) {
          throw new Error(`Formato no compatible: ${ext || 'sin extensión'}`)
        }
        fs.renameSync(job.path, target)
        updateDocumentJob(job.id, { path: target, status: 'completed', finishedAt: new Date().toISOString() })
      } catch (error) {
        updateDocumentJob(job.id, {
          status: 'failed',
          finishedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const after = getQueueState().jobs
    const movedAny = after.some((job) => job.status === 'completed' && job.finishedAt && Date.now() - Date.parse(job.finishedAt) < 10_000)
    if (movedAny) {
      try {
        await prepareCorpusAndTrain()
      } catch (error) {
        console.error('[LLM worker] training failed:', error)
      }
    }
  } finally {
    running = false
  }
}

async function main() {
  ensureDirs()
  console.log('[LLM worker] iniciado')
  setInterval(() => void processQueue(), POLL_MS).unref()
  await processQueue()
}

main().catch((error) => {
  console.error('[LLM worker] fatal:', error)
  process.exitCode = 1
})
