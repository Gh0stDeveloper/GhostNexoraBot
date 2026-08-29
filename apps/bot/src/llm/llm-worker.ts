import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { loadCorpus } from './loader.js'
import { miniLLM as coreMiniLLM } from '../services/mini-llm-transformer.js'
import { getQueueState, updateDocumentJob } from './document-queue.js'
import { consumeTrainingRequest } from './training-queue.js'

const ROOT = path.resolve(config.dataDir, 'llm')
const CORPUS = path.join(ROOT, 'corpus')
const INBOX = path.join(ROOT, 'inbox')
const RAW_VECTORS = path.join(ROOT, 'corpus.bin')
const VOCAB = path.join(ROOT, 'vocab.json')
const MAGIC = Buffer.from('NXLLM2\0', 'ascii')
const DIM = 128
const MAX_CHUNK = 900
const MAX_SENTENCES = 4000
const POLL_MS = 2000
const AUTO_MS = 30 * 60 * 1000
let busy = false
let lastAuto = Date.now()

function ensureDirs() { fs.mkdirSync(INBOX, { recursive: true }); fs.mkdirSync(CORPUS, { recursive: true }); fs.mkdirSync(ROOT, { recursive: true }) }
function clean(text: string) { return text.normalize('NFKC').replace(/\r/g, '\n').replace(/[^\p{L}\p{N}\p{P}\p{Z}\n]/gu, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() }
function tokens(text: string) { return text.toLocaleLowerCase('es-MX').match(/[\p{L}\p{N}]+|[^\p{L}\p{N}\s]/gu) ?? [] }
function buildVocab(texts: string[]) {
  const counts = new Map<string, number>()
  for (const text of texts) for (const token of tokens(text)) counts.set(token, (counts.get(token) ?? 0) + 1)
  return ['<unk>', '<bos>', '<eos>', ...[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7997).map(([token]) => token)]
}
function hashVector(text: string) {
  const v = new Float32Array(DIM); const lower = text.toLowerCase()
  for (let i = 0; i < lower.length; i++) { const a = lower.charCodeAt(i); const b = i + 1 < lower.length ? lower.charCodeAt(i + 1) : 0; const slot = (a * 31 + b * 17 + i * 13) % DIM; v[slot] += ((a % 97) + 1) / 100 }
  let norm = 0; for (const x of v) norm += x * x; norm = Math.sqrt(norm) || 1; for (let i = 0; i < DIM; i++) v[i] /= norm
  return v
}
function rebuildIndexes(corpusText: string) {
  const texts = clean(corpusText).split(/[.!?\n]+/).map((x) => x.trim()).filter((x) => x.length > 10).slice(0, MAX_SENTENCES)
  if (!texts.length) throw new Error('El corpus no contiene texto utilizable.')
  const vocab = buildVocab(texts)
  fs.writeFileSync(VOCAB, JSON.stringify({ version: 2, vocab, generatedAt: new Date().toISOString() }, null, 2))
  const buffers: Buffer[] = [MAGIC]; let id = 1
  for (const text of texts) {
    const vec = hashVector(text); const textBuffer = Buffer.from(text, 'utf8').subarray(0, 65535); const header = Buffer.alloc(6); header.writeUInt32LE(id++, 0); header.writeUInt16LE(textBuffer.length, 4)
    buffers.push(header, Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength), textBuffer)
  }
  fs.writeFileSync(RAW_VECTORS, Buffer.concat(buffers))
  return { chunks: texts.length, vocab: vocab.length, characters: corpusText.length }
}

async function moveQueuedDocuments() {
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
      updateDocumentJob(job.id, { status: 'completed', finishedAt: new Date().toISOString(), path: target })
      moved++
    } catch (error) {
      updateDocumentJob(job.id, { status: 'failed', finishedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) })
    }
  }
  return moved
}

async function trainCorpus() {
  if (busy) return null
  busy = true
  try {
    const corpusText = await loadCorpus(CORPUS)
    if (!corpusText) return { ok: false as const, reason: 'empty_corpus' as const }
    const index = rebuildIndexes(corpusText)
    const result = await coreMiniLLM.train('worker')
    if (!result.started) return { ok: false as const, reason: result.reason, ...index }
    return { ok: true as const, ...index, steps: result.steps, loss: result.loss }
  } finally { busy = false }
}

async function trainLive() {
  if (busy) return null
  busy = true
  try { return await coreMiniLLM.train('auto') }
  finally { busy = false }
}

async function tick() {
  ensureDirs()
  if (busy) return
  const moved = await moveQueuedDocuments()
  const requested = consumeTrainingRequest()
  const stats = coreMiniLLM.stats()
  const autoDue = stats.autoTrainEnabled && Date.now() - lastAuto >= AUTO_MS && stats.pendingMessages >= 20
  if (moved > 0 || requested) await trainCorpus()
  else if (autoDue) await trainLive()
  if (moved > 0 || requested || autoDue) lastAuto = Date.now()
}

async function main() {
  ensureDirs()
  console.log('[LLM worker] iniciado; aprendizaje aislado del proceso WhatsApp')
  setInterval(() => void tick().catch((error) => console.error('[LLM worker] tick:', error)), POLL_MS).unref()
  await tick()
}

main().catch((error) => { console.error('[LLM worker] fatal:', error); process.exitCode = 1 })
