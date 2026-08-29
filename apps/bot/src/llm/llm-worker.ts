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
const VECTORS = path.join(ROOT, 'corpus.bin')
const VOCAB = path.join(ROOT, 'vocab.json')
const MODEL = path.join(ROOT, 'model.bin')
const STATE = path.join(ROOT, 'state.json')
const DIM = 128
const MAGIC = Buffer.from('NXLLM2\0', 'ascii')
const MAX_CHUNK = 900
const MAX_VOCAB = 8000
const POLL_MS = 2000
const LIVE_BATCH = 100
let busy = false

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.tsv', '.json', '.xml', '.html', '.htm', '.pdf', '.docx'])

function ensureDirs() {
  fs.mkdirSync(ROOT, { recursive: true })
  fs.mkdirSync(INBOX, { recursive: true })
  fs.mkdirSync(CORPUS, { recursive: true })
}

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T } catch { return fallback }
}

function writeJsonAtomic(file: string, value: unknown) {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
  fs.renameSync(tmp, file)
}

function getState() {
  return readJson<Record<string, unknown>>(STATE, {})
}

function currentTrainRun() {
  const run = Number(getState().trainRuns ?? 0)
  return Number.isInteger(run) && run >= 0 ? run : 0
}

function checkpointModel(run: number) {
  return path.join(ROOT, `model-${run}.bin`)
}

function checkpointVocab(run: number) {
  return path.join(ROOT, `vocab-${run}.json`)
}

function getVocab(file = VOCAB): string[] {
  const data = readJson<{ vocab?: unknown[] }>(file, {})
  return Array.isArray(data.vocab) ? data.vocab.filter((v): v is string => typeof v === 'string') : []
}

function saveVocab(vocab: string[], minimumSize: number) {
  if (vocab.length < minimumSize) {
    throw new Error(`Vocabulario regresó de ${minimumSize} a ${vocab.length}; entrenamiento abortado.`)
  }
  writeJsonAtomic(VOCAB, { version: 2, vocab, generatedAt: new Date().toISOString() })
}

function tokens(text: string) {
  return text.toLocaleLowerCase('es-MX').match(/[\p{L}\p{N}]+|[^\p{L}\p{N}\s]/gu) ?? []
}

function clean(text: string) {
  return text.normalize('NFKC')
    .replace(/\r/g, '\n')
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}\n]/gu, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function splitChunks(text: string) {
  const normalized = clean(text)
  if (!normalized) return [] as string[]
  const chunks: string[] = []
  for (const paragraph of normalized.split(/\n{2,}/)) {
    for (let offset = 0; offset < paragraph.length; offset += MAX_CHUNK) {
      const chunk = paragraph.slice(offset, offset + MAX_CHUNK).trim()
      if (chunk.length > 10) chunks.push(chunk)
    }
  }
  return chunks
}

function hashVector(text: string) {
  const vector = new Float32Array(DIM)
  const lower = text.toLowerCase()
  for (let i = 0; i < lower.length; i++) {
    const a = lower.charCodeAt(i)
    const b = i + 1 < lower.length ? lower.charCodeAt(i + 1) : 0
    const slot = (a * 31 + b * 17 + i * 13) % DIM
    vector[slot] += ((a % 97) + 1) / 100
  }
  let norm = 0
  for (const value of vector) norm += value * value
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < DIM; i++) vector[i] /= norm
  return vector
}

type RecordItem = { id: number; vector: Float32Array; text: string }

function readVectors(): RecordItem[] {
  ensureDirs()
  if (!fs.existsSync(VECTORS)) return []
  const buffer = fs.readFileSync(VECTORS)
  if (buffer.length < MAGIC.length || !buffer.subarray(0, MAGIC.length).equals(MAGIC)) return []
  const out: RecordItem[] = []
  let offset = MAGIC.length
  while (offset + 6 <= buffer.length) {
    const id = buffer.readUInt32LE(offset)
    const textLen = buffer.readUInt16LE(offset + 4)
    offset += 6
    const bytes = DIM * 4
    if (offset + bytes + textLen > buffer.length) break
    const vector = new Float32Array(DIM)
    for (let i = 0; i < DIM; i++) vector[i] = buffer.readFloatLE(offset + i * 4)
    offset += bytes
    const text = buffer.subarray(offset, offset + textLen).toString('utf8')
    offset += textLen
    out.push({ id, vector, text })
  }
  return out
}

function appendVectors(records: RecordItem[]) {
  if (!records.length) return
  if (!fs.existsSync(VECTORS) || fs.statSync(VECTORS).size === 0) fs.writeFileSync(VECTORS, MAGIC)
  const fd = fs.openSync(VECTORS, 'a')
  try {
    for (const item of records) {
      const textBuffer = Buffer.from(item.text, 'utf8').subarray(0, 65535)
      const header = Buffer.alloc(6)
      header.writeUInt32LE(item.id, 0)
      header.writeUInt16LE(textBuffer.length, 4)
      fs.writeSync(fd, header)
      fs.writeSync(fd, Buffer.from(item.vector.buffer, item.vector.byteOffset, item.vector.byteLength))
      fs.writeSync(fd, textBuffer)
    }
  } finally { fs.closeSync(fd) }
}

function mergeVocab(base: string[], corpusText: string[]) {
  const result = [...base]
  const known = new Set(result)
  const counts = new Map<string, number>()
  for (const text of corpusText) {
    for (const token of tokens(text)) {
      if (!known.has(token)) counts.set(token, (counts.get(token) ?? 0) + 1)
    }
  }
  const additions = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([token]) => token)
  result.push(...additions.filter((token) => !known.has(token)).slice(0, Math.max(0, MAX_VOCAB - result.length)))
  return result
}

function appendCorpusVectors(corpusText: string) {
  const existing = readVectors()
  const seen = new Set(existing.map((item) => item.text))
  let nextId = existing.reduce((max, item) => Math.max(max, item.id), 0) + 1
  const additions: RecordItem[] = []
  for (const text of splitChunks(corpusText)) {
    if (seen.has(text)) continue
    seen.add(text)
    additions.push({ id: nextId++, vector: hashVector(text), text })
  }
  appendVectors(additions)
  return { previous: existing.length, added: additions.length, total: existing.length + additions.length }
}

function listCorpusFiles() {
  const files: string[] = []
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full)
    }
  }
  walk(CORPUS)
  return files
}

function patchState(patch: Record<string, unknown>) {
  const state = getState()
  writeJsonAtomic(STATE, { ...state, ...patch })
}

function expandModelFromCheckpoint(baseModel: string, baseVocabSize: number, targetVocabSize: number) {
  if (targetVocabSize < baseVocabSize) throw new Error(`Vocabulario objetivo ${targetVocabSize} < base ${baseVocabSize}; abortado.`)
  const buffer = fs.readFileSync(baseModel)
  const newline = buffer.indexOf(10)
  if (newline < 0) throw new Error(`Checkpoint inválido: ${baseModel}`)
  const meta = readJson<{ version?: number; vocabSize?: number; dim?: number; heads?: number }>(baseModel, {})
  void meta
  let header: { version?: number; vocabSize?: number; dim?: number; heads?: number }
  try { header = JSON.parse(buffer.subarray(0, newline).toString('utf8')) as typeof header } catch { throw new Error(`Metadatos inválidos en ${baseModel}`) }
  if (header.version !== 2 || header.dim !== DIM || header.vocabSize !== baseVocabSize || header.heads !== 4) throw new Error(`Checkpoint incompatible: ${baseModel}`)

  let offset = newline + 1
  const read = (count: number) => {
    const array = new Float32Array(count)
    for (let i = 0; i < count; i++) array[i] = buffer.readFloatLE(offset + i * 4)
    offset += count * 4
    return array
  }
  const embeddings = read(baseVocabSize * DIM)
  const wq = buffer.subarray(offset, offset += DIM * DIM * 4)
  const wk = buffer.subarray(offset, offset += DIM * DIM * 4)
  const wv = buffer.subarray(offset, offset += DIM * DIM * 4)
  const wo = buffer.subarray(offset, offset += DIM * DIM * 4)
  const output = read(baseVocabSize * DIM)
  const bias = read(baseVocabSize)

  const expandedEmbeddings = new Float32Array(targetVocabSize * DIM)
  const expandedOutput = new Float32Array(targetVocabSize * DIM)
  const expandedBias = new Float32Array(targetVocabSize)
  expandedEmbeddings.set(embeddings)
  expandedOutput.set(output)
  expandedBias.set(bias)

  for (let row = baseVocabSize; row < targetVocabSize; row++) {
    for (let d = 0; d < DIM; d++) {
      const raw = Math.sin((row + 1) * 12.9898 + (d + 1) * 78.233) * 43758.5453
      const normalized = raw - Math.floor(raw)
      const value = (normalized - 0.5) * 0.02
      expandedEmbeddings[row * DIM + d] = value
      expandedOutput[row * DIM + d] = value
    }
  }

  const headerBuffer = Buffer.from(JSON.stringify({ version: 2, vocabSize: targetVocabSize, dim: DIM, heads: 4 }) + '\n')
  const temp = `${MODEL}.tmp`
  fs.writeFileSync(temp, Buffer.concat([
    headerBuffer,
    Buffer.from(expandedEmbeddings.buffer),
    wq, wk, wv, wo,
    Buffer.from(expandedOutput.buffer),
    Buffer.from(expandedBias.buffer),
  ]))
  fs.renameSync(temp, MODEL)
}

function prepareBaseModel(run: number, currentVocabSize: number, targetVocabSize: number) {
  if (run <= 0) return
  const baseModel = checkpointModel(run)
  const baseVocabFile = checkpointVocab(run)
  if (!fs.existsSync(baseModel) || !fs.existsSync(baseVocabFile)) {
    throw new Error(`Faltan los checkpoints obligatorios de la vuelta ${run}: model-${run}.bin y/o vocab-${run}.json.`)
  }
  const baseVocab = getVocab(baseVocabFile)
  if (baseVocab.length < currentVocabSize) {
    throw new Error(`La base del checkpoint (${baseVocab.length}) es menor que el vocabulario actual (${currentVocabSize}); abortado.`)
  }
  if (baseVocab.length < targetVocabSize) {
    expandModelFromCheckpoint(baseModel, baseVocab.length, targetVocabSize)
  } else {
    fs.copyFileSync(baseModel, MODEL)
  }
  const currentBase = getVocab()
  const requiredMinimum = Math.max(baseVocab.length, currentBase.length)
  if (targetVocabSize < requiredMinimum) throw new Error(`Vocabulario objetivo ${targetVocabSize} < mínimo ${requiredMinimum}; abortado.`)
}

async function moveQueuedDocuments() {
  const queued = getQueueState().jobs.filter((job) => job.status === 'queued')
  let moved = 0
  for (const job of queued) {
    updateDocumentJob(job.id, { status: 'processing', startedAt: new Date().toISOString(), error: undefined })
    try {
      if (!fs.existsSync(job.path)) throw new Error('El archivo recibido ya no existe.')
      const ext = path.extname(job.filename).toLowerCase()
      if (!SUPPORTED_EXTENSIONS.has(ext)) throw new Error(`Formato no compatible: ${ext || 'sin extensión'}`)
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

async function processLiveQueue() {
  const messages = drainLiveMessages(LIVE_BATCH)
  if (!messages.length) return 0
  for (const text of messages) coreMiniLLM.addLive(text)
  return messages.length
}

async function trainCorpus() {
  if (busy) return null
  busy = true
  const baseRun = currentTrainRun()
  const nextRun = baseRun + 1
  try {
    const corpusText = await loadCorpus(CORPUS)
    if (!corpusText) throw new Error('No hay texto utilizable en el corpus.')

    const currentVocab = getVocab()
    const currentVocabSize = currentVocab.length

    if (baseRun > 0 && fs.existsSync(checkpointVocab(baseRun))) {
      const checkpointVocabData = getVocab(checkpointVocab(baseRun))
      if (checkpointVocabData.length > currentVocabSize) {
        fs.copyFileSync(checkpointVocab(baseRun), VOCAB)
      }
    }

    const baseVocabulary = getVocab()
    if (baseVocabulary.length < currentVocabSize) {
      throw new Error(`Vocabulario retrocedió de ${currentVocabSize} a ${baseVocabulary.length}; abortado.`)
    }

    const mergedVocab = mergeVocab(baseVocabulary, [corpusText])
    if (mergedVocab.length < baseVocabulary.length) {
      throw new Error(`Vocabulario retrocedió de ${baseVocabulary.length} a ${mergedVocab.length}; abortado.`)
    }
    saveVocab(mergedVocab, baseVocabulary.length)

    const vectors = appendCorpusVectors(corpusText)
    const finalVocabSize = getVocab().length
    if (finalVocabSize < currentVocabSize) throw new Error(`Vocabulario ${finalVocabSize} < ${currentVocabSize}; entrenamiento abortado.`)

    prepareBaseModel(baseRun, baseVocabulary.length, finalVocabSize)

    patchState({
      totalDocuments: listCorpusFiles().length,
      totalChunks: vectors.total,
      learning: false,
      currentProgress: 0,
      currentStep: 0,
      currentTotalSteps: 0,
      currentEpoch: 0,
      currentTotalEpochs: 0,
      currentMessage: `Preparando vuelta ${nextRun} desde ${baseRun > 0 ? `model-${baseRun}.bin` : 'modelo actual'} · vocab ${finalVocabSize} · vectores ${vectors.total}`,
    })

    const result = await coreMiniLLM.train(`worker-round-${nextRun}`)
    if (!result.started) throw new Error(`Entrenamiento no iniciado: ${result.reason}`)

    const finalVocab = getVocab().length
    const minimumVocab = Math.max(currentVocabSize, baseVocabulary.length)
    if (finalVocab < minimumVocab) throw new Error(`Regresión de vocabulario: ${finalVocab} < ${minimumVocab}. Checkpoint no guardado.`)

    if (!fs.existsSync(MODEL)) throw new Error('El entrenamiento terminó sin generar model.bin.')
    fs.copyFileSync(MODEL, checkpointModel(nextRun))
    fs.copyFileSync(VOCAB, checkpointVocab(nextRun))

    patchState({
      totalDocuments: listCorpusFiles().length,
      totalChunks: readVectors().length,
      currentMessage: `Completado: vuelta ${nextRun} · ${result.steps} pasos · loss ${result.loss?.toFixed(5) ?? 'N/D'}`,
    })

    return { ok: true as const, run: nextRun, vectors, vocab: finalVocab, steps: result.steps, loss: result.loss }
  } finally {
    busy = false
  }
}

async function tick() {
  ensureDirs()
  if (busy) return
  const moved = await moveQueuedDocuments()
  const liveProcessed = await processLiveQueue()
  const requested = consumeTrainingRequest()
  if (moved > 0 || requested) {
    try { await trainCorpus() } catch (error) { console.error('[LLM worker] corpus:', error); patchState({ learning: false, currentMessage: `ERROR: ${error instanceof Error ? error.message : String(error)}` }) }
  } else if (liveProcessed > 0) {
    patchState({ currentMessage: `Mensajes vivos procesados: +${liveProcessed}` })
  }
}

async function main() {
  ensureDirs()
  console.log('[LLM worker] iniciado; entrenamiento incremental con checkpoints y vocabulario monotónico')
  while (true) {
    try { await tick() } catch (error) { console.error('[LLM worker] tick:', error) }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS))
  }
}

main().catch((error) => { console.error('[LLM worker] fatal:', error); process.exitCode = 1 })
