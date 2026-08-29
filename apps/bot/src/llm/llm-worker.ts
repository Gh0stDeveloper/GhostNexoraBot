import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { loadCorpus } from './loader.js'
import { miniLLM as coreMiniLLM } from '../services/mini-llm-transformer.js'
import { getQueueState, updateDocumentJob } from './document-queue.js'
import { drainLiveMessages } from './live-queue.js'
import { consumeTrainingRequest } from './training-queue.js'

const ROOT = path.resolve(config.dataDir, 'llm')
const CORPUS = path.join(ROOT, 'corpus')
const INBOX = path.join(ROOT, 'inbox')
const RAW_VECTORS = path.join(ROOT, 'corpus.bin')
const VOCAB = path.join(ROOT, 'vocab.json')
const STATE_FILE = path.join(ROOT, 'state.json')
const MAGIC = Buffer.from('NXLLM2\0', 'ascii')
const DIM = 128
const MAX_SENTENCES = 4000
const POLL_MS = 2000
const AUTO_MS = 30 * 60 * 1000
const LIVE_BATCH = 100
const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.tsv', '.json', '.xml', '.html', '.htm', '.pdf', '.docx'])
let busy = false
let lastAuto = Date.now()

function ensureDirs() { fs.mkdirSync(ROOT, { recursive: true }); fs.mkdirSync(INBOX, { recursive: true }); fs.mkdirSync(CORPUS, { recursive: true }) }
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
  if (!texts.length) throw new Error('El corpus no contiene texto utilizable. Verifica PDF/DOCX y sus parsers.')
  const vocab = buildVocab(texts)
  fs.writeFileSync(VOCAB, JSON.stringify({ version: 2, vocab, generatedAt: new Date().toISOString() }, null, 2))
  const buffers: Buffer[] = [MAGIC]; let id = 1
  for (const text of texts) { const vector = hashVector(text); const textBuffer = Buffer.from(text, 'utf8').subarray(0, 65535); const header = Buffer.alloc(6); header.writeUInt32LE(id++, 0); header.writeUInt16LE(textBuffer.length, 4); buffers.push(header, Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength), textBuffer) }
  fs.writeFileSync(RAW_VECTORS, Buffer.concat(buffers))
  return { chunks: texts.length, vocab: vocab.length, characters: corpusText.length }
}
function updateDocumentStats(index: { chunks: number }) {
  ensureDirs(); let state: Record<string, unknown> = {}; try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Record<string, unknown> } catch {}
  state.totalDocuments = listCorpusFiles().length
  state.totalChunks = index.chunks
  fs.writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify(state, null, 2)); fs.renameSync(`${STATE_FILE}.tmp`, STATE_FILE)
}
function listCorpusFiles() {
  const result: string[] = []
  const walk = (dir: string) => { if (!fs.existsSync(dir)) return; for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) result.push(full) } }
  walk(CORPUS); return result
}
async function moveQueuedDocuments() {
  const queued = getQueueState().jobs.filter((job) => job.status === 'queued'); let moved = 0
  for (const job of queued) { updateDocumentJob(job.id, { status: 'processing', startedAt: new Date().toISOString(), error: undefined }); try { if (!fs.existsSync(job.path)) throw new Error('El archivo recibido ya no existe.'); const ext = path.extname(job.filename).toLowerCase(); if (!SUPPORTED_EXTENSIONS.has(ext)) throw new Error(`Formato no compatible: ${ext || 'sin extensión'}`); const target = path.join(CORPUS, `${job.id}-${job.filename}`); fs.renameSync(job.path, target); moved++ } catch (error) { updateDocumentJob(job.id, { status: 'failed', finishedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }) } }
  return moved
}
function finalizeQueuedJobs() { const state = getQueueState(); for (const job of state.jobs.filter((item) => item.status === 'processing')) { if (fs.existsSync(job.path)) updateDocumentJob(job.id, { status: 'completed', finishedAt: new Date().toISOString() }) } }
async function processLiveQueue() { const messages = drainLiveMessages(LIVE_BATCH); if (!messages.length) return 0; for (const text of messages) coreMiniLLM.addLive(text); return messages.length }
async function trainCorpus() {
  if (busy) return null; busy = true
  try { const filesBefore = listCorpusFiles(); const corpusText = await loadCorpus(CORPUS); if (!corpusText) throw new Error(filesBefore.length ? 'Los documentos existen, pero ninguno produjo texto utilizable. Revisa PDF/DOCX y sus parsers.' : 'No hay documentos en el corpus.'); const index = rebuildIndexes(corpusText); updateDocumentStats(index); const result = await coreMiniLLM.train('worker'); if (!result.started) throw new Error(`Entrenamiento no iniciado: ${result.reason}`); finalizeQueuedJobs(); return { ...index, steps: result.steps, loss: result.loss } } finally { busy = false }
}
async function trainLive() { if (busy) return null; busy = true; try { return await coreMiniLLM.train('auto') } finally { busy = false } }
async function tick() {
  ensureDirs(); if (busy) return
  const moved = await moveQueuedDocuments(); const liveProcessed = await processLiveQueue(); const requested = consumeTrainingRequest(); const stats = coreMiniLLM.stats(); const autoDue = stats.autoTrainEnabled && Date.now() - lastAuto >= AUTO_MS && stats.pendingMessages >= 20
  if (moved > 0 || requested) { try { await trainCorpus() } catch (error) { console.error('[LLM worker] corpus:', error) } } else if (autoDue) { try { await trainLive() } catch (error) { console.error('[LLM worker] live:', error) } }
  if (moved > 0 || liveProcessed > 0 || requested || autoDue) lastAuto = Date.now()
}
async function main() { ensureDirs(); console.log('[LLM worker] iniciado; aprendizaje aislado del proceso WhatsApp'); while (true) { try { await tick() } catch (error) { console.error('[LLM worker] tick:', error) }; await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS)) } }
main().catch((error) => { console.error('[LLM worker] fatal:', error); process.exitCode = 1 })
