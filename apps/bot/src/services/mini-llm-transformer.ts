import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { loadVocab } from '../llm/incremental-training.js'

const ROOT = path.resolve(config.dataDir, 'llm')
const CORPUS_DIR = path.join(ROOT, 'corpus')
const LIVE_FILE = path.join(ROOT, 'live_corpus.txt')
const VOCAB_FILE = path.join(ROOT, 'vocab.json')
const MODEL_FILE = path.join(ROOT, 'model.bin')
const VECTORS_FILE = path.join(ROOT, 'corpus.bin')
const STATE_FILE = path.join(ROOT, 'state.json')

const DIM = 128
const HEADS = 4
const HEAD_DIM = DIM / HEADS
const VOCAB_LIMIT = 8000
const MAX_CONTEXT = 64
const MAX_CHUNK = 900
const TOP_K = 5
const MAX_TRAIN_RECORDS = Number(process.env.LLM_MAX_TRAIN_RECORDS ?? 5000)
const TRAIN_EPOCHS = Math.max(1, Number(process.env.LLM_TRAIN_EPOCHS ?? 2))
const MAX_STEPS_PER_RUN = Math.max(0, Number(process.env.LLM_MAX_STEPS_PER_RUN ?? 0))
const AUTO_TRAIN_EVERY_MS = 30 * 60 * 1000
const MIN_AUTO_TRAIN_MESSAGES = 20
const MIN_MODEL_TRAIN_STEPS_FOR_GENERATION = 250
const CHECKPOINT_EVERY_STEPS = Math.max(100, Number(process.env.LLM_CHECKPOINT_EVERY ?? 1000))
const PROGRESS_EVERY_STEPS = 25
const MAGIC = Buffer.from('NXLLM2\\0', 'ascii')

type LlmState = {
  startedAt: string
  totalDocuments: number
  totalChunks: number
  totalMessages: number
  trainedMessages: number
  trainRuns: number
  trainSteps: number
  modelVersion: number
  lastTrainAt: string | null
  lastTrainDurationMs: number
  lastLoss: number | null
  bestLoss: number | null
  learning: boolean
  autoTrainEnabled: boolean
  currentProgress: number
  currentStep: number
  currentTotalSteps: number
  currentEpoch: number
  currentTotalEpochs: number
  currentMessage: string
}

type RecordItem = { id: number; vector: Float32Array; text: string }
type Result = { text: string; score: number }
type Model = { vocabSize: number; dim: number; heads: number; embeddings: Float32Array; wq: Float32Array; wk: Float32Array; wv: Float32Array; wo: Float32Array; output: Float32Array; bias: Float32Array }

const DEFAULT_STATE: LlmState = {
  startedAt: new Date().toISOString(), totalDocuments: 0, totalChunks: 0, totalMessages: 0,
  trainedMessages: 0, trainRuns: 0, trainSteps: 0, modelVersion: 2, lastTrainAt: null,
  lastTrainDurationMs: 0, lastLoss: null, bestLoss: null, learning: false, autoTrainEnabled: true,
  currentProgress: 0, currentStep: 0, currentTotalSteps: 0, currentEpoch: 0, currentTotalEpochs: 0,
  currentMessage: 'En espera',
}

function ensureDirs() {
  fs.mkdirSync(CORPUS_DIR, { recursive: true })
  if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2))
}

function getState(): LlmState {
  ensureDirs()
  try { return { ...DEFAULT_STATE, ...(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Partial<LlmState>) } } catch { return { ...DEFAULT_STATE } }
}

function saveState(value: LlmState) {
  ensureDirs()
  const tmp = `${STATE_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
  fs.renameSync(tmp, STATE_FILE)
}

function updateProgress(patch: Partial<LlmState>) { saveState({ ...getState(), ...patch }) }

function clean(text: string) {
  return text.normalize('NFKC').replace(/\r/g, '\n').replace(/[^\p{L}\p{N}\p{P}\p{Z}\n]/gu, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function splitChunks(text: string) {
  const value = clean(text); if (!value) return [] as string[]
  const out: string[] = []
  for (const paragraph of value.split(/\n{2,}/)) for (let i = 0; i < paragraph.length; i += MAX_CHUNK) out.push(paragraph.slice(i, i + MAX_CHUNK).trim())
  return out.filter(Boolean)
}

function hashVector(text: string) {
  const vector = new Float32Array(DIM), lower = text.toLowerCase()
  for (let i = 0; i < lower.length; i++) {
    const a = lower.charCodeAt(i), b = i + 1 < lower.length ? lower.charCodeAt(i + 1) : 0, slot = (a * 31 + b * 17 + i * 13) % DIM
    vector[slot] += ((a % 97) + 1) / 100
  }
  let norm = 0; for (const value of vector) norm += value * value
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < DIM; i++) vector[i] /= norm
  return vector
}

function appendBinary(records: RecordItem[]) {
  if (!records.length) return
  ensureDirs()
  if (!fs.existsSync(VECTORS_FILE) || fs.statSync(VECTORS_FILE).size === 0) fs.writeFileSync(VECTORS_FILE, MAGIC)
  const fd = fs.openSync(VECTORS_FILE, 'a')
  try {
    for (const item of records) {
      const textBuffer = Buffer.from(item.text, 'utf8').subarray(0, 65535), header = Buffer.alloc(6)
      header.writeUInt32LE(item.id, 0); header.writeUInt16LE(textBuffer.length, 4)
      fs.writeSync(fd, header); fs.writeSync(fd, Buffer.from(item.vector.buffer, item.vector.byteOffset, item.vector.byteLength)); fs.writeSync(fd, textBuffer)
    }
  } finally { fs.closeSync(fd) }
}

function readBinary() {
  ensureDirs(); if (!fs.existsSync(VECTORS_FILE)) return [] as RecordItem[]
  const file = fs.readFileSync(VECTORS_FILE); if (file.length < MAGIC.length || !file.subarray(0, MAGIC.length).equals(MAGIC)) return [] as RecordItem[]
  const results: RecordItem[] = []; let offset = MAGIC.length
  while (offset + 6 <= file.length) {
    const id = file.readUInt32LE(offset), textLen = file.readUInt16LE(offset + 4); offset += 6
    if (offset + DIM * 4 + textLen > file.length) break
    const vector = new Float32Array(DIM); for (let i = 0; i < DIM; i++) vector[i] = file.readFloatLE(offset + i * 4)
    offset += DIM * 4
    const text = file.subarray(offset, offset + textLen).toString('utf8'); offset += textLen
    results.push({ id, vector, text })
  }
  return results
}

function cosine(a: Float32Array, b: Float32Array) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < DIM; i++) { dot += a[i]! * b[i]!; normA += a[i]! * a[i]!; normB += b[i]! * b[i]! }
  return dot / ((Math.sqrt(normA) * Math.sqrt(normB)) || 1)
}

function tokenize(text: string) { return text.toLocaleLowerCase('es-MX').match(/[\p{L}\p{N}]+|[^\p{L}\p{N}\s]/gu) ?? [] }
function normalizeTerms(text: string) { return tokenize(text).filter((value) => value.length >= 2) }

function lexicalScore(query: string, text: string) {
  const terms = new Set(normalizeTerms(query)); if (!terms.size) return 0
  const haystack = new Set(normalizeTerms(text)); let matches = 0
  for (const term of terms) if (haystack.has(term)) matches++
  return matches / terms.size
}

function search(query: string, topK = TOP_K) {
  const q = hashVector(query)
  return readBinary().map((item) => ({ text: item.text, score: 0.55 * cosine(q, item.vector) + 0.45 * lexicalScore(query, item.text) })).sort((a, b) => b.score - a.score).slice(0, topK)
}

function saveModel(model: Model, file = MODEL_FILE) {
  const header = Buffer.from(JSON.stringify({ version: 2, vocabSize: model.vocabSize, dim: model.dim, heads: model.heads }) + '\n')
  const payload = [model.embeddings, model.wq, model.wk, model.wv, model.wo, model.output, model.bias].map((value) => Buffer.from(value.buffer, value.byteOffset, value.byteLength))
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, Buffer.concat([header, ...payload]))
  fs.renameSync(tmp, file)
}

function seeded(seed: number) { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x) }
function initModel(vocabSize: number): Model {
  const size = Math.max(4, vocabSize)
  const make = (length: number, scale: number, salt: number) => { const out = new Float32Array(length); for (let i = 0; i < length; i++) out[i] = (seeded(i + salt) - 0.5) * scale; return out }
  return { vocabSize: size, dim: DIM, heads: HEADS, embeddings: make(size * DIM, 0.08, 11), wq: make(DIM * DIM, 0.04, 101), wk: make(DIM * DIM, 0.04, 202), wv: make(DIM * DIM, 0.04, 303), wo: make(DIM * DIM, 0.04, 404), output: make(size * DIM, 0.04, 505), bias: new Float32Array(size) }
}

function readModel(modelFile = MODEL_FILE) {
  if (!fs.existsSync(modelFile)) throw new Error(`No existe ${path.basename(modelFile)}; no se permite reinicializar el modelo incremental.`)
  const file = fs.readFileSync(modelFile), newline = file.indexOf(10)
  if (newline < 0) throw new Error('model.bin no contiene una cabecera válida.')
  const meta = JSON.parse(file.subarray(0, newline).toString('utf8')) as { version?: number; vocabSize?: number; dim?: number; heads?: number }
  if (meta.version !== 2 || meta.dim !== DIM || meta.heads !== HEADS || !Number.isInteger(meta.vocabSize)) throw new Error('model.bin incompatible con Mini-LLM v2.')
  const oldSize = Number(meta.vocabSize); let offset = newline + 1
  const read = (count: number) => { const out = new Float32Array(count); const bytes = count * 4; if (offset + bytes > file.length) throw new Error('model.bin está truncado o corrupto.'); for (let i = 0; i < count; i++) out[i] = file.readFloatLE(offset + i * 4); offset += bytes; return out }
  return { oldSize, embeddings: read(oldSize * DIM), wq: read(DIM * DIM), wk: read(DIM * DIM), wv: read(DIM * DIM), wo: read(DIM * DIM), output: read(oldSize * DIM), bias: read(oldSize) }
}

function loadModel(vocabSize: number): Model {
  const current = readModel();
  if (current.oldSize > vocabSize) throw new Error(`MODELO REGRESIVO: model.bin=${current.oldSize} > vocab=${vocabSize}. Se rechaza cualquier reducción.`)
  const model = initModel(vocabSize)
  model.embeddings.set(current.embeddings)
  model.wq.set(current.wq); model.wk.set(current.wk); model.wv.set(current.wv); model.wo.set(current.wo)
  model.output.set(current.output); model.bias.set(current.bias)
  return model
}

function matVec(matrix: Float32Array, input: Float32Array, rows: number, cols: number) {
  const out = new Float32Array(rows)
  for (let row = 0; row < rows; row++) { let sum = 0, base = row * cols; for (let col = 0; col < cols; col++) sum += matrix[base + col]! * input[col]!; out[row] = sum }
  return out
}
function positional(position: number, index: number) { const angle = position / Math.pow(10000, (2 * Math.floor(index / 2)) / DIM); return index % 2 === 0 ? Math.sin(angle) : Math.cos(angle) }

function forward(model: Model, ids: number[]) {
  const tokens = ids.slice(-MAX_CONTEXT), states: Float32Array[] = []
  for (let position = 0; position < tokens.length; position++) {
    const h = new Float32Array(DIM), base = (tokens[position] ?? 0) * DIM
    for (let i = 0; i < DIM; i++) h[i] = model.embeddings[base + i]! + positional(position, i)
    states.push(h)
  }
  const residual = states.map((h, position) => {
    const q = matVec(model.wq, h, DIM, DIM), ctx = new Float32Array(DIM)
    for (let head = 0; head < HEADS; head++) {
      const start = head * HEAD_DIM, scores: number[] = []
      for (let j = 0; j <= position; j++) {
        const k = matVec(model.wk, states[j]!, DIM, DIM); let dot = 0
        for (let d = 0; d < HEAD_DIM; d++) dot += q[start + d]! * k[start + d]!
        scores.push(dot / Math.sqrt(HEAD_DIM))
      }
      let max = -Infinity; for (const value of scores) if (value > max) max = value
      let total = 0; for (let i = 0; i < scores.length; i++) { scores[i] = Math.exp(scores[i]! - max); total += scores[i]! }
      for (let j = 0; j <= position; j++) { const weight = scores[j]! / Math.max(total, 1e-9), v = matVec(model.wv, states[j]!, DIM, DIM); for (let d = 0; d < HEAD_DIM; d++) ctx[start + d] += weight * v[start + d]! }
    }
    const projected = matVec(model.wo, ctx, DIM, DIM)
    for (let i = 0; i < DIM; i++) projected[i] = Math.max(0, projected[i]! + h[i]!)
    return projected
  })
  const last = residual.at(-1) ?? new Float32Array(DIM), probs = new Float32Array(model.vocabSize)
  let maxLogit = -Infinity
  for (let i = 0; i < model.vocabSize; i++) { let value = model.bias[i]!; const base = i * DIM; for (let j = 0; j < DIM; j++) value += model.output[base + j]! * last[j]!; probs[i] = value; if (value > maxLogit) maxLogit = value }
  let sum = 0; for (let i = 0; i < probs.length; i++) { probs[i] = Math.exp(Math.max(-30, probs[i]! - maxLogit)); sum += probs[i]! }
  for (let i = 0; i < probs.length; i++) probs[i] /= Math.max(sum, 1e-9)
  return { hidden: last, probs }
}

function trainStep(model: Model, ids: number[], lr = 0.001) {
  if (ids.length < 2) return null
  const target = ids.at(-1)!, input = ids.slice(0, -1), pass = forward(model, input), probability = Math.max(pass.probs[target]!, 1e-9), loss = -Math.log(probability)
  for (let i = 0; i < model.vocabSize; i++) {
    const gradient = pass.probs[i]! - (i === target ? 1 : 0), base = i * DIM
    for (let j = 0; j < DIM; j++) model.output[base + j] -= lr * gradient * pass.hidden[j]!
    model.bias[i] -= lr * gradient
  }
  const targetBase = target * DIM
  if (targetBase >= 0 && targetBase + DIM <= model.embeddings.length) for (let j = 0; j < DIM; j++) model.embeddings[targetBase + j] += lr * 0.1 * pass.hidden[j]!
  return loss
}

function sample(probs: Float32Array, temperature = 0.65, topK = 16) {
  const candidates = [...probs].map((value, index) => ({ value: Math.pow(Math.max(value, 1e-12), 1 / Math.max(temperature, 0.1)), index })).sort((a, b) => b.value - a.value).slice(0, topK)
  const total = candidates.reduce((sum, item) => sum + item.value, 0); let cursor = Math.random() * total
  for (const item of candidates) { cursor -= item.value; if (cursor <= 0) return item.index }
  return candidates[0]?.index ?? 0
}

function vectorSearchAnswer(query: string) { const hits = search(query, 3); return hits.length ? hits.map((h, i) => `${i + 1}. ${h.text.slice(0, 700)}`).join('\n\n') : 'No tengo conocimiento local suficiente todavía.' }
function bestExtractiveAnswer(query: string, hits: Result[]) {
  const terms = new Set(normalizeTerms(query)), candidates: { sentence: string; score: number }[] = []
  for (const hit of hits) for (const sentence of hit.text.split(/(?<=[.!?])\s+|\n+/).map((value) => value.trim()).filter((value) => value.length >= 20)) {
    const set = new Set(normalizeTerms(sentence)); let overlap = 0; for (const term of terms) if (set.has(term)) overlap++
    const score = overlap / Math.max(terms.size, 1) + hit.score * 0.25; if (score > 0) candidates.push({ sentence, score })
  }
  candidates.sort((a, b) => b.score - a.score)
  return [...new Set(candidates.map((item) => item.sentence))].slice(0, 3)
}

function addLive(text: string) {
  const value = clean(text); if (!value) return
  ensureDirs(); fs.appendFileSync(LIVE_FILE, `${new Date().toISOString()}\t${value}\n`)
  const parts = splitChunks(value), records = readBinary(), start = records.length ? Math.max(...records.map((item) => item.id)) + 1 : 1
  appendBinary(parts.map((part, index) => ({ id: start + index, vector: hashVector(part), text: part })))
  const vocab = loadVocab()
  if (vocab.length === 0) throw new Error('No existe vocabulario base para aprendizaje incremental.')
  const state = getState(); state.totalMessages++; state.totalChunks += parts.length; state.vectorRecords = readBinary().length as unknown as never; saveState(state)
}

async function train(reason = 'manual') {
  const initial = getState()
  if (initial.learning) return { started: false, reason: 'already_running' as const }
  const vocab = loadVocab()
  const records = readBinary().slice(-Math.max(1, MAX_TRAIN_RECORDS))
  const sequences = records.map((record) => tokenize(record.text).map((token) => vocab.indexOf(token)).filter((id) => id >= 0 && id < vocab.length)).filter((ids) => ids.length >= 2)
  if (!vocab.length || !sequences.length) return { started: false, reason: 'no_training_data' as const }

  const rawEstimatedSteps = sequences.reduce((total, ids) => total + Math.max(1, ids.length - 1), 0) * TRAIN_EPOCHS
  const totalSteps = MAX_STEPS_PER_RUN > 0 ? Math.min(rawEstimatedSteps, MAX_STEPS_PER_RUN) : rawEstimatedSteps
  updateProgress({ learning: true, currentProgress: 0, currentStep: 0, currentTotalSteps: totalSteps, currentEpoch: 0, currentTotalEpochs: TRAIN_EPOCHS, currentMessage: `Preparando ${sequences.length} secuencias` })

  const model = loadModel(vocab.length)
  let lossTotal = 0, steps = 0, stoppedByLimit = false
  const started = Date.now()
  try {
    outer: for (let epoch = 1; epoch <= TRAIN_EPOCHS; epoch++) {
      updateProgress({ currentEpoch: epoch, currentMessage: `Entrenando época ${epoch}/${TRAIN_EPOCHS}` })
      for (const ids of sequences) {
        for (let position = 1; position < ids.length; position++) {
          if (MAX_STEPS_PER_RUN > 0 && steps >= MAX_STEPS_PER_RUN) { stoppedByLimit = true; break outer }
          const loss = trainStep(model, ids.slice(Math.max(0, position - MAX_CONTEXT), position + 1))
          if (loss !== null) { lossTotal += loss; steps++ }
          const state = getState()
          state.currentStep = steps
          state.currentProgress = Math.min(100, Math.round((steps / Math.max(totalSteps, 1)) * 100))
          if (steps > 0 && steps % PROGRESS_EVERY_STEPS === 0) {
            const avg = lossTotal / steps
            state.trainSteps = (initial.trainSteps || 0) + steps
            state.lastLoss = avg
            if (state.bestLoss === null || avg < state.bestLoss) state.bestLoss = avg
            state.currentMessage = `Loss medio: ${avg.toFixed(5)}`
          }
          saveState(state)
          if (steps > 0 && steps % CHECKPOINT_EVERY_STEPS === 0) {
            saveModel(model)
            const checkpointState = getState()
            checkpointState.trainSteps = (initial.trainSteps || 0) + steps
            checkpointState.lastLoss = lossTotal / steps
            checkpointState.currentMessage = `Checkpoint ${steps} pasos · loss ${(lossTotal / steps).toFixed(5)}`
            saveState(checkpointState)
          }
          if (steps % PROGRESS_EVERY_STEPS === 0) await new Promise<void>((resolve) => setImmediate(resolve))
        }
      }
    }

    saveModel(model)
    const final = getState()
    const averageLoss = steps ? lossTotal / steps : null
    final.trainRuns = (initial.trainRuns || 0) + 1
    final.trainSteps = (initial.trainSteps || 0) + steps
    final.trainedMessages = final.totalMessages
    final.modelVersion = (initial.modelVersion || 2) + 1
    final.lastTrainAt = new Date().toISOString()
    final.lastTrainDurationMs = Date.now() - started
    final.lastLoss = averageLoss
    final.bestLoss = averageLoss !== null && (final.bestLoss === null || averageLoss < final.bestLoss) ? averageLoss : final.bestLoss
    final.learning = false
    final.currentProgress = totalSteps ? Math.min(100, Math.round((steps / totalSteps) * 100)) : 100
    final.currentStep = steps
    final.currentTotalSteps = totalSteps
    final.currentMessage = stoppedByLimit ? `Límite de ${steps} pasos alcanzado` : `Completado: ${steps} pasos`
    saveState(final)
    return { started: true, reason, steps, loss: averageLoss, durationMs: final.lastTrainDurationMs }
  } catch (error) {
    updateProgress({ learning: false, currentMessage: `Entrenamiento detenido por error: ${error instanceof Error ? error.message : String(error)}` })
    throw error
  }
}

function stats() {
  const state = getState(); let storageBytes = 0
  for (const file of [STATE_FILE, VOCAB_FILE, VECTORS_FILE, MODEL_FILE, LIVE_FILE]) try { storageBytes += fs.statSync(file).size } catch {}
  return { ...state, pendingMessages: Math.max(0, state.totalMessages - state.trainedMessages), vectorRecords: readBinary().length, vocabSize: loadVocab().length, storageBytes }
}

function listDocuments() {
  ensureDirs(); const files: string[] = []
  const walk = (dir: string) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (/\.(txt|md|csv|tsv|json|xml|html?|pdf|docx)$/i.test(entry.name)) files.push(full) } }
  walk(CORPUS_DIR)
  return files.map((file) => ({ name: path.relative(CORPUS_DIR, file), size: fs.statSync(file).size }))
}

function answer(query: string) {
  const hits = search(query, 4), vocab = loadVocab(), state = getState()
  if (!hits.length) return 'No tengo conocimiento local suficiente todavía.'
  const extractive = bestExtractiveAnswer(query, hits), ready = Boolean(vocab.length && state.trainSteps >= MIN_MODEL_TRAIN_STEPS_FOR_GENERATION)
  if (extractive.length && !ready) return `${extractive.join(' ')}\n\nFuente local:\n${hits.slice(0, 2).map((h, i) => `${i + 1}. ${h.text.slice(0, 450)}`).join('\n\n')}`
  if (!vocab.length) return vectorSearchAnswer(query)
  const ids = tokenize(query).map((token) => vocab.indexOf(token)).filter((id) => id >= 0 && id < vocab.length)
  if (!ids.length) return vectorSearchAnswer(query)
  const model = loadModel(vocab.length), generated = [...ids]
  for (let i = 0; i < 24; i++) { const next = sample(forward(model, generated).probs); generated.push(next); if (next === 2) break }
  const text = generated.slice(ids.length).map((id) => vocab[id] ?? '').filter(Boolean).join(' ').trim()
  return text.length >= 8 ? `${text}\n\nContexto local:\n${hits.slice(0, 2).map((h, i) => `${i + 1}. ${h.text.slice(0, 500)}`).join('\n\n')}` : vectorSearchAnswer(query)
}

function startAutoTrain() {
  ensureDirs()
  setInterval(() => { const state = getState(); if (state.autoTrainEnabled && !state.learning && state.totalMessages - state.trainedMessages >= MIN_AUTO_TRAIN_MESSAGES) void train('auto').catch(() => undefined) }, AUTO_TRAIN_EVERY_MS)
}

export const miniLLM = { ROOT, addLive, train, stats, listDocuments, answer, search, startAutoTrain, constants: { DIM, HEADS, VOCAB_LIMIT, AUTO_TRAIN_EVERY_MS, MIN_AUTO_TRAIN_MESSAGES, MAX_TRAIN_RECORDS, TRAIN_EPOCHS, MAX_STEPS_PER_RUN, CHECKPOINT_EVERY_STEPS } }
