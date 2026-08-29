import fs from 'node:fs'
import path from 'node:path'
import type { WASocket, WAMessage } from 'baileys'
import { config } from '../config.js'
import { downloadMessageMedia } from '../utils/message.js'
import { logger } from '../utils/logger.js'

const ROOT = path.join(config.dataDir, 'llm')
const CORPUS_DIR = path.join(ROOT, 'corpus')
const LIVE_FILE = path.join(ROOT, 'live_corpus.txt')
const VOCAB_FILE = path.join(ROOT, 'vocab.json')
const VECTORS_FILE = path.join(ROOT, 'corpus.bin')
const MODEL_FILE = path.join(ROOT, 'model.bin')
const STATE_FILE = path.join(ROOT, 'state.json')
const DIM = 128
const VOCAB_LIMIT = 8000
const MAX_CHUNK = 900
const TOP_K = 5
const AUTO_TRAIN_EVERY_MS = 30 * 60 * 1000
const MIN_AUTO_TRAIN_MESSAGES = 20
const MAGIC = Buffer.from('NXLLM1\0', 'ascii')

type State = {
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
  learning: boolean
  autoTrainEnabled: boolean
}

type RecordItem = { id: number; vector: Float32Array; text: string }
type Result = { text: string; score: number }

type Model = { vocabSize: number; dim: number; embeddings: Float32Array; output: Float32Array; bias: Float32Array }

const DEFAULT_STATE: State = {
  startedAt: new Date().toISOString(), totalDocuments: 0, totalChunks: 0, totalMessages: 0,
  trainedMessages: 0, trainRuns: 0, trainSteps: 0, modelVersion: 1,
  lastTrainAt: null, lastTrainDurationMs: 0, lastLoss: null, learning: false, autoTrainEnabled: true,
}

function ensureDirs() {
  fs.mkdirSync(CORPUS_DIR, { recursive: true })
  if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2))
}
function state(): State {
  ensureDirs()
  try { return { ...DEFAULT_STATE, ...(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Partial<State>) } } catch { return { ...DEFAULT_STATE } }
}
function saveState(value: State) {
  ensureDirs(); const tmp = `${STATE_FILE}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value, null, 2)); fs.renameSync(tmp, STATE_FILE)
}
function clean(text: string) {
  return text.normalize('NFKC').replace(/\r/g, '\n').replace(/[^\p{L}\p{N}\p{P}\p{Z}\n]/gu, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}
function splitChunks(text: string) {
  const value = clean(text); if (!value) return [] as string[]
  const out: string[] = []
  for (const paragraph of value.split(/\n{2,}/)) {
    if (!paragraph) continue
    for (let i = 0; i < paragraph.length; i += MAX_CHUNK) out.push(paragraph.slice(i, i + MAX_CHUNK).trim())
  }
  return out.filter(Boolean)
}
function hashVector(text: string) {
  const v = new Float32Array(DIM); const lower = text.toLowerCase()
  for (let i = 0; i < lower.length; i++) {
    const a = lower.charCodeAt(i); const b = i + 1 < lower.length ? lower.charCodeAt(i + 1) : 0
    const slot = (a * 31 + b * 17 + i * 13) % DIM
    v[slot] += ((a % 97) + 1) / 100
  }
  let norm = 0; for (const x of v) norm += x * x; norm = Math.sqrt(norm) || 1
  for (let i = 0; i < DIM; i++) v[i] /= norm
  return v
}
function appendBinary(records: RecordItem[]) {
  ensureDirs(); const chunks: Buffer[] = [MAGIC]
  const existing = fs.existsSync(VECTORS_FILE) ? fs.readFileSync(VECTORS_FILE) : null
  if (existing?.subarray(0, MAGIC.length).equals(MAGIC)) chunks[0] = existing
  else if (existing) { fs.writeFileSync(VECTORS_FILE, MAGIC); chunks[0] = fs.readFileSync(VECTORS_FILE) }
  const fd = fs.openSync(VECTORS_FILE, 'a')
  try {
    for (const item of records) {
      const header = Buffer.alloc(6); header.writeUInt32LE(item.id, 0); const textBuffer = Buffer.from(item.text, 'utf8'); header.writeUInt16LE(Math.min(65535, textBuffer.length), 4)
      fs.writeSync(fd, header); fs.writeSync(fd, Buffer.from(item.vector.buffer, item.vector.byteOffset, item.vector.byteLength)); fs.writeSync(fd, textBuffer.subarray(0, 65535))
    }
  } finally { fs.closeSync(fd) }
}
function readBinary() {
  ensureDirs(); if (!fs.existsSync(VECTORS_FILE)) return [] as RecordItem[]
  const buf = fs.readFileSync(VECTORS_FILE); if (buf.length < MAGIC.length || !buf.subarray(0, MAGIC.length).equals(MAGIC)) return [] as RecordItem[]
  const out: RecordItem[] = []; let offset = MAGIC.length
  while (offset + 6 <= buf.length) {
    const id = buf.readUInt32LE(offset); const textLen = buf.readUInt16LE(offset + 4); offset += 6
    const vectorBytes = DIM * 4; if (offset + vectorBytes + textLen > buf.length) break
    const values = new Float32Array(DIM); for (let i = 0; i < DIM; i++) values[i] = buf.readFloatLE(offset + i * 4)
    offset += vectorBytes; const text = buf.subarray(offset, offset + textLen).toString('utf8'); offset += textLen
    out.push({ id, vector: values, text })
  }
  return out
}
function vocabFromTexts(texts: string[]) {
  const counts = new Map<string, number>()
  for (const text of texts) for (const token of text.toLowerCase().split(/\s+/).filter(Boolean)) counts.set(token, (counts.get(token) ?? 0) + 1)
  const vocab = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, VOCAB_LIMIT).map(([token]) => token)
  fs.writeFileSync(VOCAB_FILE, JSON.stringify({ version: 1, vocab }, null, 2))
  return vocab
}
function readVocab() { try { return (JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf8')) as { vocab?: string[] }).vocab ?? [] } catch { return [] as string[] } }
function seeded(seed: number) { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x) }
function initModel(vocabSize: number): Model {
  const embeddings = new Float32Array(Math.max(1, vocabSize) * DIM); const output = new Float32Array(Math.max(1, vocabSize) * DIM); const bias = new Float32Array(Math.max(1, vocabSize))
  for (let i = 0; i < embeddings.length; i++) embeddings[i] = (seeded(i + 11) - 0.5) * 0.08
  for (let i = 0; i < output.length; i++) output[i] = (seeded(i + 101) - 0.5) * 0.04
  return { vocabSize: Math.max(1, vocabSize), dim: DIM, embeddings, output, bias }
}
function saveModel(model: Model) {
  const header = Buffer.from(JSON.stringify({ version: 1, vocabSize: model.vocabSize, dim: model.dim }) + '\n', 'utf8')
  const payload = Buffer.concat([
    Buffer.from(model.embeddings.buffer, model.embeddings.byteOffset, model.embeddings.byteLength),
    Buffer.from(model.output.buffer, model.output.byteOffset, model.output.byteLength),
    Buffer.from(model.bias.buffer, model.bias.byteOffset, model.bias.byteLength),
  ])
  fs.writeFileSync(MODEL_FILE, Buffer.concat([header, payload]))
}
function loadModel(vocabSize: number) {
  try {
    const buf = fs.readFileSync(MODEL_FILE); const split = buf.indexOf(10); if (split < 0) return initModel(vocabSize)
    const meta = JSON.parse(buf.subarray(0, split).toString('utf8')) as { vocabSize?: number; dim?: number }; if (meta.vocabSize !== vocabSize || meta.dim !== DIM) return initModel(vocabSize)
    let offset = split + 1; const read = (length: number) => { const arr = new Float32Array(length); const bytes = length * 4; arr.set(new Float32Array(buf.buffer, buf.byteOffset + offset, length)); offset += bytes; return arr }
    return { vocabSize, dim: DIM, embeddings: read(vocabSize * DIM), output: read(vocabSize * DIM), bias: read(vocabSize) }
  } catch { return initModel(vocabSize) }
}
function tokenIds(text: string, vocab: string[]) { const map = new Map(vocab.map((token, i) => [token, i])); return text.toLowerCase().split(/\s+/).map((token) => map.get(token)).filter((x): x is number => x !== undefined) }
function trainOne(model: Model, ids: number[], learningRate = 0.002) {
  if (ids.length < 2) return null; const context = ids.slice(0, -1).slice(-32); const target = ids.at(-1)!; const h = new Float32Array(DIM)
  for (const id of context) { const base = id * DIM; for (let j = 0; j < DIM; j++) h[j] += model.embeddings[base + j]! / context.length }
  const logits = new Float32Array(model.vocabSize); let max = -Infinity
  for (let i = 0; i < model.vocabSize; i++) { let value = model.bias[i]!; const base = i * DIM; for (let j = 0; j < DIM; j++) value += model.output[base + j]! * h[j]!; logits[i] = value; if (value > max) max = value }
  let sum = 0; for (let i = 0; i < logits.length; i++) { logits[i] = Math.exp(Math.max(-30, logits[i]! - max)); sum += logits[i]! }
  const pTarget = Math.max(logits[target]! / Math.max(sum, 1e-9), 1e-9); const loss = -Math.log(pTarget)
  for (let i = 0; i < model.vocabSize; i++) {
    const grad = logits[i]! / Math.max(sum, 1e-9) - (i === target ? 1 : 0); const base = i * DIM
    for (let j = 0; j < DIM; j++) model.output[base + j] -= learningRate * grad * h[j]!
    model.bias[i] -= learningRate * grad
  }
  const targetBase = target * DIM; for (let j = 0; j < DIM; j++) model.embeddings[targetBase + j] += learningRate * 0.01 * h[j]!
  return loss
}
function cosine(a: Float32Array, b: Float32Array) { let dot = 0; let na = 0; let nb = 0; for (let i = 0; i < DIM; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]! } return dot / ((Math.sqrt(na) * Math.sqrt(nb)) || 1) }
function search(query: string, topK = TOP_K): Result[] { const q = hashVector(query); return readBinary().map((item) => ({ text: item.text, score: cosine(q, item.vector) })).sort((a, b) => b.score - a.score).slice(0, topK) }

async function addDocument(socket: WASocket, message: WAMessage) {
  const media = await downloadMessageMedia(message)
  if (!media || media.kind !== 'document') throw new Error('Envía o responde a un PDF, DOCX o TXT con este comando.')
  const name = media.fileName || 'document.txt'; const ext = path.extname(name).toLowerCase()
  let text = ''
  if (['.txt', '.md', '.json', '.csv'].includes(ext)) text = media.buffer.toString('utf8')
  else if (ext === '.pdf') { const mod = await import('pdf-parse'); const parser = (mod as any).default ?? mod; text = String((await parser(media.buffer)).text ?? '') }
  else if (ext === '.docx') { const mammoth = await import('mammoth'); text = (await mammoth.extractRawText({ buffer: media.buffer })).value }
  else throw new Error('Formato no soportado. Usa PDF, DOCX o TXT.')
  const parts = splitChunks(text); if (!parts.length) throw new Error('El documento no contiene texto utilizable.')
  ensureDirs(); const safeName = name.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 100); fs.writeFileSync(path.join(CORPUS_DIR, `${Date.now()}-${safeName}.txt`), parts.join('\n\n'))
  const records = readBinary(); let nextId = records.length ? Math.max(...records.map((x) => x.id)) + 1 : 1
  appendBinary(parts.map((part) => ({ id: nextId++, vector: hashVector(part), text: part })))
  vocabFromTexts(parts)
  const s = state(); s.totalDocuments += 1; s.totalChunks += parts.length; saveState(s)
  return { name, chunks: parts.length, characters: text.length }
}
function addLive(text: string) {
  const value = clean(text); if (!value) return; ensureDirs(); fs.appendFileSync(LIVE_FILE, `${new Date().toISOString()}\t${value}\n`)
  const parts = splitChunks(value); const records = readBinary(); let nextId = records.length ? Math.max(...records.map((x) => x.id)) + 1 : 1
  appendBinary(parts.map((part) => ({ id: nextId++, vector: hashVector(part), text: part }))); vocabFromTexts(parts)
  const s = state(); s.totalMessages += 1; s.totalChunks += parts.length; saveState(s)
}
async function train(reason = 'manual') {
  const s = state(); if (s.learning) return { started: false, reason: 'already_running' as const }
  s.learning = true; saveState(s); const started = Date.now()
  try {
    const vocab = readVocab(); const texts = readBinary().map((x) => x.text).slice(-4000); const model = loadModel(vocab.length); let lossTotal = 0; let steps = 0
    for (const text of texts) { const ids = tokenIds(text, vocab); for (let i = 0; i < ids.length - 1; i += 4) { const loss = trainOne(model, ids.slice(Math.max(0, i - 31), i + 1)); if (loss !== null) { lossTotal += loss; steps++ } } }
    saveModel(model); s.trainRuns++; s.trainSteps += steps; s.trainedMessages = s.totalMessages; s.modelVersion++; s.lastTrainAt = new Date().toISOString(); s.lastTrainDurationMs = Date.now() - started; s.lastLoss = steps ? lossTotal / steps : null
    return { started: true, reason, steps, loss: s.lastLoss, durationMs: s.lastTrainDurationMs }
  } finally { s.learning = false; saveState(s) }
}
function stats() {
  const s = state(); let bytes = 0; if (fs.existsSync(ROOT)) for (const file of fs.readdirSync(ROOT)) { try { const stat = fs.statSync(path.join(ROOT, file)); if (stat.isFile()) bytes += stat.size } catch {} }
  return { ...s, pendingMessages: Math.max(0, s.totalMessages - s.trainedMessages), vectorRecords: readBinary().length, vocabSize: readVocab().length, storageBytes: bytes }
}
function listDocuments() { ensureDirs(); return fs.readdirSync(CORPUS_DIR).filter((x) => x.endsWith('.txt')).map((name) => { const stat = fs.statSync(path.join(CORPUS_DIR, name)); return { name, size: stat.size } }) }
function answer(query: string) { const hits = search(query, 3); if (!hits.length) return 'No tengo conocimiento local suficiente todavía.'; return hits.map((hit, i) => `${i + 1}. ${hit.text.slice(0, 600)}`).join('\n\n') }
function startAutoTrain() { ensureDirs(); setInterval(() => { const s = state(); if (s.autoTrainEnabled && !s.learning && s.totalMessages - s.trainedMessages >= MIN_AUTO_TRAIN_MESSAGES) void train('auto').catch((error) => logger.warn({ error }, 'mini-llm auto training failed')) }, AUTO_TRAIN_EVERY_MS).unref() }

export const miniLLM = { ROOT, addDocument, addLive, train, stats, listDocuments, answer, search, startAutoTrain, constants: { DIM, AUTO_TRAIN_EVERY_MS, MIN_AUTO_TRAIN_MESSAGES } }
