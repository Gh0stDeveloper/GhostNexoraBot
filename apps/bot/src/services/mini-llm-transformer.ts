import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'

const ROOT = path.join(config.dataDir, 'llm')
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
const MAX_TRAIN_RECORDS = 5000
const AUTO_TRAIN_EVERY_MS = 30 * 60 * 1000
const MIN_AUTO_TRAIN_MESSAGES = 20
const MIN_MODEL_TRAIN_STEPS_FOR_GENERATION = 250
const MAGIC = Buffer.from('NXLLM2\0', 'ascii')

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
type Model = {
  vocabSize: number
  dim: number
  heads: number
  embeddings: Float32Array
  wq: Float32Array
  wk: Float32Array
  wv: Float32Array
  wo: Float32Array
  output: Float32Array
  bias: Float32Array
}

const DEFAULT_STATE: LlmState = {
  startedAt: new Date().toISOString(), totalDocuments: 0, totalChunks: 0, totalMessages: 0,
  trainedMessages: 0, trainRuns: 0, trainSteps: 0, modelVersion: 2,
  lastTrainAt: null, lastTrainDurationMs: 0, lastLoss: null, bestLoss: null,
  learning: false, autoTrainEnabled: true, currentProgress: 0, currentStep: 0, currentTotalSteps: 0,
  currentEpoch: 0, currentTotalEpochs: 0, currentMessage: 'En espera',
}

function ensureDirs() {
  fs.mkdirSync(CORPUS_DIR, { recursive: true })
  if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2))
}
function getState(): LlmState {
  ensureDirs()
  try { return { ...DEFAULT_STATE, ...(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Partial<LlmState>) } }
  catch { return { ...DEFAULT_STATE } }
}
function saveState(value: LlmState) {
  ensureDirs(); const tmp = `${STATE_FILE}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value, null, 2)); fs.renameSync(tmp, STATE_FILE)
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
  const v = new Float32Array(DIM); const lower = text.toLowerCase()
  for (let i = 0; i < lower.length; i++) { const a = lower.charCodeAt(i); const b = i + 1 < lower.length ? lower.charCodeAt(i + 1) : 0; const slot = (a * 31 + b * 17 + i * 13) % DIM; v[slot] += ((a % 97) + 1) / 100 }
  let norm = 0; for (const x of v) norm += x * x; norm = Math.sqrt(norm) || 1; for (let i = 0; i < DIM; i++) v[i] /= norm; return v
}
function appendBinary(records: RecordItem[]) {
  ensureDirs(); const existing = fs.existsSync(VECTORS_FILE) ? fs.readFileSync(VECTORS_FILE) : null
  if (!existing || !existing.subarray(0, MAGIC.length).equals(MAGIC)) fs.writeFileSync(VECTORS_FILE, MAGIC)
  const fd = fs.openSync(VECTORS_FILE, 'a')
  try { for (const item of records) { const textBuffer = Buffer.from(item.text, 'utf8').subarray(0, 65535); const header = Buffer.alloc(6); header.writeUInt32LE(item.id, 0); header.writeUInt16LE(textBuffer.length, 4); fs.writeSync(fd, header); fs.writeSync(fd, Buffer.from(item.vector.buffer, item.vector.byteOffset, item.vector.byteLength)); fs.writeSync(fd, textBuffer) } }
  finally { fs.closeSync(fd) }
}
function readBinary() {
  ensureDirs(); if (!fs.existsSync(VECTORS_FILE)) return [] as RecordItem[]
  const buf = fs.readFileSync(VECTORS_FILE); if (buf.length < MAGIC.length || !buf.subarray(0, MAGIC.length).equals(MAGIC)) return [] as RecordItem[]
  const out: RecordItem[] = []; let offset = MAGIC.length
  while (offset + 6 <= buf.length) { const id = buf.readUInt32LE(offset); const textLen = buf.readUInt16LE(offset + 4); offset += 6; const bytes = DIM * 4; if (offset + bytes + textLen > buf.length) break; const vector = new Float32Array(DIM); for (let i = 0; i < DIM; i++) vector[i] = buf.readFloatLE(offset + i * 4); offset += bytes; const text = buf.subarray(offset, offset + textLen).toString('utf8'); offset += textLen; out.push({ id, vector, text }) }
  return out
}
function cosine(a: Float32Array, b: Float32Array) { let dot = 0; let na = 0; let nb = 0; for (let i = 0; i < DIM; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]! } return dot / ((Math.sqrt(na) * Math.sqrt(nb)) || 1) }
function tokenize(text: string) { return text.toLocaleLowerCase('es-MX').match(/[\p{L}\p{N}]+|[^\p{L}\p{N}\s]/gu) ?? [] }
function normalizeTerms(text: string) { return tokenize(text).map((value) => value.toLocaleLowerCase('es-MX')).filter((value) => value.length >= 2) }
function lexicalScore(query: string, text: string) { const terms = normalizeTerms(query); if (!terms.length) return 0; const haystack = normalizeTerms(text); const counts = new Map<string, number>(); for (const token of haystack) counts.set(token, (counts.get(token) ?? 0) + 1); let matched = 0; for (const term of new Set(terms)) if ((counts.get(term) ?? 0) > 0) matched += 1; return matched / new Set(terms).size }
function search(query: string, topK = TOP_K): Result[] { const q = hashVector(query); return readBinary().map((item) => ({ text: item.text, score: 0.55 * cosine(q, item.vector) + 0.45 * lexicalScore(query, item.text) })).sort((a, b) => b.score - a.score).slice(0, topK) }
function trainVocab(texts: string[]) { const counts = new Map<string, number>(); for (const text of texts) for (const token of tokenize(text)) counts.set(token, (counts.get(token) ?? 0) + 1); const old = readVocab(); const seen = new Set(old); const additions = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([token]) => token).filter((token) => !seen.has(token)).slice(0, Math.max(0, VOCAB_LIMIT - old.length)); const vocab = [...old, ...additions]; if (vocab.length < old.length) throw new Error(`INVARIANTE: vocabulario bajó de ${old.length} a ${vocab.length}`); fs.writeFileSync(VOCAB_FILE, JSON.stringify({ version: 2, vocab, generatedAt: new Date().toISOString() }, null, 2)); return vocab }
function readVocab() { try { return (JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf8')) as { vocab?: string[] }).vocab ?? [] } catch { return [] } }
function positional(position: number, index: number) { const angle = position / Math.pow(10000, (2 * Math.floor(index / 2)) / DIM); return index % 2 === 0 ? Math.sin(angle) : Math.cos(angle) }
function seeded(seed: number) { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x) }
function initModel(vocabSize: number): Model { const size = Math.max(4, vocabSize); const make = (length: number, scale: number, salt: number) => { const a = new Float32Array(length); for (let i = 0; i < length; i++) a[i] = (seeded(i + salt) - 0.5) * scale; return a }; return { vocabSize: size, dim: DIM, heads: HEADS, embeddings: make(size * DIM, 0.08, 11), wq: make(DIM * DIM, 0.04, 101), wk: make(DIM * DIM, 0.04, 202), wv: make(DIM * DIM, 0.04, 303), wo: make(DIM * DIM, 0.04, 404), output: make(size * DIM, 0.04, 505), bias: new Float32Array(size) } }
function saveModel(model: Model) { const header = Buffer.from(JSON.stringify({ version: 2, vocabSize: model.vocabSize, dim: model.dim, heads: model.heads }) + '\n'); const payload = [model.embeddings, model.wq, model.wk, model.wv, model.wo, model.output, model.bias].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength)); fs.writeFileSync(MODEL_FILE, Buffer.concat([header, ...payload])) }
function loadModel(vocabSize: number): Model { try { const buf = fs.readFileSync(MODEL_FILE); const split = buf.indexOf(10); if (split < 0) return initModel(vocabSize); const meta = JSON.parse(buf.subarray(0, split).toString('utf8')) as { version?: number; vocabSize?: number; dim?: number; heads?: number }; if (meta.version !== 2 || meta.vocabSize !== vocabSize || meta.dim !== DIM || meta.heads !== HEADS) return initModel(vocabSize); let offset = split + 1; const read = (len: number) => { const a = new Float32Array(len); for (let i = 0; i < len; i++) a[i] = buf.readFloatLE(offset + i * 4); offset += len * 4; return a }; return { vocabSize, dim: DIM, heads: HEADS, embeddings: read(vocabSize * DIM), wq: read(DIM * DIM), wk: read(DIM * DIM), wv: read(DIM * DIM), wo: read(DIM * DIM), output: read(vocabSize * DIM), bias: read(vocabSize) } } catch { return initModel(vocabSize) } }
function matVec(matrix: Float32Array, input: Float32Array, rows: number, cols: number) { const out = new Float32Array(rows); for (let r = 0; r < rows; r++) { let sum = 0; const base = r * cols; for (let c = 0; c < cols; c++) sum += matrix[base + c]! * input[c]!; out[r] = sum } return out }
function relu(x: number) { return x > 0 ? x : 0 }

function forward(model: Model, ids: number[]) { const tokens = ids.slice(-MAX_CONTEXT); const states: Float32Array[] = []; for (let p = 0; p < tokens.length; p++) { const h = new Float32Array(DIM); const base = tokens[p]! * DIM; for (let i = 0; i < DIM; i++) h[i] = model.embeddings[base + i]! + positional(p, i); states.push(h) } const residual = states.map((h, position) => { const q = matVec(model.wq, h, DIM, DIM); const context = new Float32Array(DIM); for (let head = 0; head < HEADS; head++) { const start = head * HEAD_DIM; const scores: number[] = []; for (let j = 0; j <= position; j++) { const kj = matVec(model.wk, states[j]!, DIM, DIM); let dot = 0; for (let d = 0; d < HEAD_DIM; d++) dot += q[start + d]! * kj[start + d]!; scores.push(dot / Math.sqrt(HEAD_DIM)) } let max = -Infinity; for (const score of scores) if (score > max) max = score; let total = 0; for (let i = 0; i < scores.length; i++) { scores[i] = Math.exp(scores[i]! - max); total += scores[i]! } for (let j = 0; j <= position; j++) { const weight = scores[j]! / Math.max(total, 1e-9); const vj = matVec(model.wv, states[j]!, DIM, DIM); for (let d = 0; d < HEAD_DIM; d++) context[start + d] += weight * vj[start + d]! } } const projected = matVec(model.wo, context, DIM, DIM); for (let i = 0; i < DIM; i++) projected[i] = relu(projected[i]! + h[i]!); return projected }); const last = residual.at(-1)!; const logits = new Float32Array(model.vocabSize); let max = -Infinity; for (let i = 0; i < model.vocabSize; i++) { let value = model.bias[i]!; const base = i * DIM; for (let j = 0; j < DIM; j++) value += model.output[base + j]! * last[j]!; logits[i] = value; if (value > max) max = value } let sum = 0; for (let i = 0; i < logits.length; i++) { logits[i] = Math.exp(Math.max(-30, logits[i]! - max)); sum += logits[i]! } for (let i = 0; i < logits.length; i++) logits[i] /= Math.max(sum, 1e-9); return { hidden: last, probs: logits } }
function trainStep(model: Model, ids: number[], learningRate = 0.001) { if (ids.length < 2) return null; const target = ids.at(-1)!; const input = ids.slice(0, -1); const pass = forward(model, input); const targetProb = Math.max(pass.probs[target]!, 1e-9); const loss = -Math.log(targetProb); for (let i = 0; i < model.vocabSize; i++) { const grad = pass.probs[i]! - (i === target ? 1 : 0); const base = i * DIM; for (let j = 0; j < DIM; j++) model.output[base + j] -= learningRate * grad * pass.hidden[j]!; model.bias[i] -= learningRate * grad } const base = target * DIM; for (let j = 0; j < DIM; j++) model.embeddings[base + j] += learningRate * 0.1 * pass.hidden[j]!; return loss }
function sample(probs: Float32Array, temperature = 0.65, topK = 16) { const items = [...probs].map((value, index) => ({ value: Math.pow(Math.max(value, 1e-12), 1 / Math.max(temperature, 0.1)), index })).sort((a, b) => b.value - a.value).slice(0, topK); const total = items.reduce((sum, x) => sum + x.value, 0); let cursor = Math.random() * total; for (const item of items) { cursor -= item.value; if (cursor <= 0) return item.index } return items[0]?.index ?? 0 }
function vectorSearchAnswer(query: string) { const hits = search(query, 3); if (!hits.length) return 'No tengo conocimiento local suficiente todavía.'; return hits.map((hit, i) => `${i + 1}. ${hit.text.slice(0, 700)}`).join('\n\n') }
function bestExtractiveAnswer(query: string, hits: Result[]) { const terms = new Set(normalizeTerms(query)); const candidates: { sentence: string; score: number }[] = []; hits.forEach((hit) => { const sentences = hit.text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length >= 20); for (const sentence of sentences) { const sentenceTerms = new Set(normalizeTerms(sentence)); let overlap = 0; for (const term of terms) if (sentenceTerms.has(term)) overlap++; const score = overlap / Math.max(terms.size, 1) + hit.score * 0.25; if (score > 0) candidates.push({ sentence, score }) } }); candidates.sort((a, b) => b.score - a.score); const unique: string[] = []; for (const candidate of candidates) if (!unique.includes(candidate.sentence)) unique.push(candidate.sentence); return unique.slice(0, 3) }

async function addDocument(socket: WASocket, message: WAMessage) { const media = await downloadMessageMedia(message); if (!media || media.kind !== 'document') throw new Error('Envía o responde a un PDF, DOCX o TXT con este comando.'); const name = media.fileName || 'document.txt'; const ext = path.extname(name).toLowerCase(); let text = ''; if (['.txt', '.md', '.json', '.csv'].includes(ext)) text = media.buffer.toString('utf8'); else if (ext === '.pdf') { const mod = await import('pdf-parse'); const parser = (mod as any).default ?? mod; text = String((await parser(media.buffer)).text ?? '') } else if (ext === '.docx') { const mammoth = await import('mammoth'); text = (await mammoth.extractRawText({ buffer: media.buffer })).value } else throw new Error('Formato no soportado. Usa PDF, DOCX o TXT.'); const parts = splitChunks(text); if (!parts.length) throw new Error('El documento no contiene texto utilizable.'); ensureDirs(); const safe = name.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 100); fs.writeFileSync(path.join(CORPUS_DIR, `${Date.now()}-${safe}.txt`), parts.join('\n\n')); const records = readBinary(); let nextId = records.length ? Math.max(...records.map((x) => x.id)) + 1 : 1; appendBinary(parts.map((part) => ({ id: nextId++, vector: hashVector(part), text: part }))); trainVocab([...parts, ...records.slice(-1000).map((x) => x.text)]); const s = getState(); s.totalDocuments += 1; s.totalChunks += parts.length; saveState(s); return { name, chunks: parts.length, characters: text.length } }
function addLive(text: string) { const value = clean(text); if (!value) return; ensureDirs(); fs.appendFileSync(LIVE_FILE, `${new Date().toISOString()}\t${value}\n`); const parts = splitChunks(value); const records = readBinary(); let nextId = records.length ? Math.max(...records.map((x) => x.id)) + 1 : 1; appendBinary(parts.map((part) => ({ id: nextId++, vector: hashVector(part), text: part }))); if (parts.length) trainVocab([...parts, ...records.slice(-250).map((x) => x.text)]); const s = getState(); s.totalMessages += 1; s.totalChunks += parts.length; saveState(s) }

async function train(reason = 'manual') { const initial = getState(); if (initial.learning) return { started: false, reason: 'already_running' as const }; const vocab = readVocab(); const records = readBinary().slice(-MAX_TRAIN_RECORDS); const sequences = records.map((x) => tokenize(x.text).map((token) => vocab.indexOf(token)).filter((id) => id >= 0)).filter((ids) => ids.length >= 2); if (!vocab.length || !sequences.length) return { started: false, reason: 'no_training_data' as const }; const epochs = 2; const totalSteps = sequences.reduce((sum, ids) => sum + Math.max(1, ids.length - 1), 0) * epochs; updateProgress({ learning: true, currentProgress: 0, currentStep: 0, currentTotalSteps: totalSteps, currentEpoch: 0, currentTotalEpochs: epochs, currentMessage: `Preparando ${sequences.length} secuencias` }); const model = loadModel(vocab.length); let lossTotal = 0; let steps = 0; const startedAt = Date.now(); try { for (let epoch = 1; epoch <= epochs; epoch++) { updateProgress({ currentEpoch: epoch, currentMessage: `Entrenando época ${epoch}/${epochs}` }); for (const ids of sequences) { for (let i = 1; i < ids.length; i++) { const loss = trainStep(model, ids.slice(Math.max(0, i - MAX_CONTEXT), i + 1)); if (loss !== null) { lossTotal += loss; steps++ } const s = getState(); s.currentStep++; s.currentProgress = Math.min(100, Math.round((s.currentStep / Math.max(s.currentTotalSteps, 1)) * 100)); if (steps % 25 === 0) s.currentMessage = `Loss medio: ${(lossTotal / steps).toFixed(5)}`; saveState(s); if (steps % 25 === 0) await new Promise<void>((resolve) => setImmediate(resolve)) } } } saveModel(model); const s = getState(); s.trainRuns++; s.trainSteps += steps; s.trainedMessages = s.totalMessages; s.modelVersion++; s.lastTrainAt = new Date().toISOString(); s.lastTrainDurationMs = Date.now() - startedAt; s.lastLoss = steps ? lossTotal / steps : null; s.bestLoss = s.lastLoss !== null && (s.bestLoss === null || s.lastLoss < s.bestLoss) ? s.lastLoss : s.bestLoss; s.learning = false; s.currentProgress = 100; s.currentMessage = `Completado: ${steps} pasos`; saveState(s); return { started: true, reason, steps, loss: s.lastLoss, durationMs: s.lastTrainDurationMs } } catch (error) { updateProgress({ learning: false, currentMessage: 'Entrenamiento detenido por error' }); throw error } }
function stats() { const s = getState(); let storageBytes = 0; for (const file of [STATE_FILE, VOCAB_FILE, VECTORS_FILE, MODEL_FILE, LIVE_FILE]) { try { storageBytes += fs.statSync(file).size } catch {} } return { ...s, pendingMessages: Math.max(0, s.totalMessages - s.trainedMessages), vectorRecords: readBinary().length, vocabSize: readVocab().length, storageBytes } }

function listDocuments() {
  ensureDirs()
  const supported = new Set(['.txt', '.md', '.csv', '.tsv', '.json', '.xml', '.html', '.htm', '.pdf', '.docx'])
  const files: { name: string; size: number; path: string }[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (supported.has(path.extname(entry.name).toLowerCase())) {
        const stat = fs.statSync(full)
        files.push({ name: entry.name, size: stat.size, path: full })
      }
    }
  }
  walk(CORPUS_DIR)
  return files
}

function answer(query: string) { const hits = search(query, 4); const vocab = readVocab(); const s = getState(); if (!hits.length) return 'No tengo conocimiento local suficiente todavía.'; const extractive = bestExtractiveAnswer(query, hits); const modelReady = Boolean(vocab.length && s.trainSteps >= MIN_MODEL_TRAIN_STEPS_FOR_GENERATION); if (extractive.length > 0 && (!modelReady || hits[0]!.score < 0.55)) return `${extractive.join(' ')}\n\nFuente local:\n${hits.slice(0, 2).map((h, i) => `${i + 1}. ${h.text.slice(0, 450)}`).join('\n\n')}`; if (!vocab.length) return vectorSearchAnswer(query); const ids = tokenize(query).map((token) => vocab.indexOf(token)).filter((id) => id >= 0); if (ids.length < 1) return vectorSearchAnswer(query); const model = loadModel(vocab.length); const generated: number[] = [...ids]; for (let i = 0; i < 24; i++) { const next = sample(forward(model, generated).probs); generated.push(next); if (next === 2) break } const generatedText = generated.slice(ids.length).map((id) => vocab[id] ?? '').filter(Boolean).join(' ').trim(); if (generatedText.length >= 8) return `${generatedText}\n\nContexto local:\n${hits.slice(0, 2).map((h, i) => `${i + 1}. ${h.text.slice(0, 500)}`).join('\n\n')}`; return vectorSearchAnswer(query) }
function startAutoTrain() { ensureDirs(); setInterval(() => { const s = getState(); if (s.autoTrainEnabled && !s.learning && s.totalMessages - s.trainedMessages >= MIN_AUTO_TRAIN_MESSAGES) void train('auto').catch((error) => logger.warn({ error }, 'mini-llm auto training failed')) }, AUTO_TRAIN_EVERY_MS).unref() }

export const miniLLM = { ROOT, addDocument, addLive, train, stats, listDocuments, answer, search, startAutoTrain, constants: { DIM, HEADS, VOCAB_LIMIT, AUTO_TRAIN_EVERY_MS, MIN_AUTO_TRAIN_MESSAGES } }
