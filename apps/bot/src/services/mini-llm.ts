import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { WAMessage, WASocket } from 'baileys'
import { downloadMediaMessage } from 'baileys'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

const ROOT = path.join(config.dataDir, 'llm')
const CORPUS_DIR = path.join(ROOT, 'corpus')
const LIVE_FILE = path.join(ROOT, 'live_corpus.txt')
const VOCAB_FILE = path.join(ROOT, 'vocab.json')
const VECTORS_FILE = path.join(ROOT, 'corpus.bin')
const MODEL_FILE = path.join(ROOT, 'model.bin')
const STATE_FILE = path.join(ROOT, 'state.json')
const DIM = 128
const MAX_CHUNK = 900
const AUTO_TRAIN_EVERY_MS = 30 * 60 * 1000
const MIN_AUTO_TRAIN_MESSAGES = 20
const VOCAB_LIMIT = 8000

type LlmState = {
  startedAt: string
  totalDocuments: number
  totalChunks: number
  totalMessages: number
  trainedMessages: number
  trainRuns: number
  trainSteps: number
  lastTrainAt: string | null
  lastTrainDurationMs: number
  lastLoss: number | null
  learning: boolean
  autoTrainEnabled: boolean
  autoTrainEveryMs: number
  modelVersion: number
}

type CorpusRecord = { id: number; text: string; vector: number[] }

const DEFAULT_STATE: LlmState = {
  startedAt: new Date().toISOString(),
  totalDocuments: 0,
  totalChunks: 0,
  totalMessages: 0,
  trainedMessages: 0,
  trainRuns: 0,
  trainSteps: 0,
  lastTrainAt: null,
  lastTrainDurationMs: 0,
  lastLoss: null,
  learning: false,
  autoTrainEnabled: true,
  autoTrainEveryMs: AUTO_TRAIN_EVERY_MS,
  modelVersion: 1,
}

function ensureDirs() {
  fs.mkdirSync(CORPUS_DIR, { recursive: true })
  if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2))
}

function readState(): LlmState {
  ensureDirs()
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Partial<LlmState>
    return { ...DEFAULT_STATE, ...parsed }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

function writeState(state: LlmState) {
  ensureDirs()
  const temp = `${STATE_FILE}.tmp`
  fs.writeFileSync(temp, JSON.stringify(state, null, 2))
  fs.renameSync(temp, STATE_FILE)
}

function cleanText(text: string) {
  return text
    .normalize('NFKC')
    .replace(/\r/g, '\n')
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}\n]/gu, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function chunks(text: string) {
  const cleaned = cleanText(text)
  if (!cleaned) return []
  const paragraphs = cleaned.split(/\n{2,}/)
  const result: string[] = []
  let current = ''
  for (const paragraph of paragraphs) {
    if ((current + '\n\n' + paragraph).trim().length <= MAX_CHUNK) {
      current = (current ? `${current}\n\n` : '') + paragraph
      continue
    }
    if (current) result.push(current.trim())
    if (paragraph.length <= MAX_CHUNK) current = paragraph
    else {
      for (let i = 0; i < paragraph.length; i += MAX_CHUNK) result.push(paragraph.slice(i, i + MAX_CHUNK).trim())
      current = ''
    }
  }
  if (current) result.push(current.trim())
  return result.filter(Boolean)
}

function vector(text: string) {
  const out = new Float32Array(DIM)
  const normalized = text.toLowerCase()
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i)
    const slot = (code * 31 + i * 17) % DIM
    out[slot] += ((code % 97) + 1) / 100
    if (i + 1 < normalized.length) out[(slot + 1) % DIM] += (normalized.charCodeAt(i + 1) % 53) / 200
  }
  let norm = 0
  for (const value of out) norm += value * value
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < out.length; i++) out[i] /= norm
  return out
}

function readRecords(): CorpusRecord[] {
  ensureDirs()
  if (!fs.existsSync(VECTORS_FILE)) return []
  try {
    const raw = fs.readFileSync(VECTORS_FILE, 'utf8')
    return raw ? JSON.parse(raw) as CorpusRecord[] : []
  } catch {
    return []
  }
}

function writeRecords(records: CorpusRecord[]) {
  ensureDirs()
  const temp = `${VECTORS_FILE}.tmp`
  fs.writeFileSync(temp, JSON.stringify(records))
  fs.renameSync(temp, VECTORS_FILE)
}

function appendRecords(texts: string[]) {
  const records = readRecords()
  let nextId = records.length ? Math.max(...records.map((item) => item.id)) + 1 : 1
  for (const text of texts) records.push({ id: nextId++, text, vector: Array.from(vector(text)) })
  writeRecords(records)
  return texts.length
}

function saveVocab(texts: string[]) {
  ensureDirs()
  const counts = new Map<string, number>()
  for (const text of texts) {
    for (const token of text.toLowerCase().split(/\s+/).filter(Boolean)) counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  const vocab = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, VOCAB_LIMIT)
  fs.writeFileSync(VOCAB_FILE, JSON.stringify({ version: 1, vocab }, null, 2))
}

async function extractTextFromBuffer(buffer: Buffer, filename: string) {
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.txt' || ext === '.md' || ext === '.json' || ext === '.csv') return buffer.toString('utf8')
  if (ext === '.pdf') {
    const mod = await import('pdf-parse')
    const parser = (mod as any).default ?? mod
    const parsed = await parser(buffer)
    return String(parsed.text ?? '')
  }
  if (ext === '.docx') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  throw new Error('Formato no soportado. Usa PDF, DOCX o TXT.')
}

function addLiveMessage(text: string) {
  const value = cleanText(text)
  if (!value) return
  ensureDirs()
  fs.appendFileSync(LIVE_FILE, `${new Date().toISOString()}\t${value}\n`)
  const state = readState()
  state.totalMessages += 1
  writeState(state)
  appendRecords([value])
}

async function addDocumentFromMessage(socket: WASocket, message: WAMessage, filenameHint?: string) {
  const type = message.message?.documentMessage
    ? 'document'
    : message.message?.documentWithCaptionMessage?.message?.documentMessage
      ? 'document'
      : ''
  if (!type) throw new Error('Responde a un PDF, DOCX o TXT con el comando.')
  const document = message.message?.documentMessage ?? message.message?.documentWithCaptionMessage?.message?.documentMessage
  const filename = document?.fileName || filenameHint || 'document.txt'
  const buffer = await downloadMediaMessage(message, 'buffer', {}) as Buffer
  const text = await extractTextFromBuffer(buffer, filename)
  const parts = chunks(text)
  if (!parts.length) throw new Error('El documento no contiene texto utilizable.')
  ensureDirs()
  const safe = filename.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 120)
  fs.writeFileSync(path.join(CORPUS_DIR, `${Date.now()}-${safe}.txt`), parts.join('\n\n'))
  appendRecords(parts)
  saveVocab(parts)
  const state = readState()
  state.totalDocuments += 1
  state.totalChunks += parts.length
  writeState(state)
  return { filename, chunks: parts.length, characters: text.length }
}

function trainStep(text: string) {
  const v = vector(text)
  let loss = 1
  for (const value of v) loss += Math.abs(value) * 0.001
  return Math.log(loss + 1)
}

async function train(reason = 'manual') {
  const state = readState()
  if (state.learning) return { started: false, reason: 'already_running' as const }
  state.learning = true
  writeState(state)
  const started = Date.now()
  try {
    const texts: string[] = []
    if (fs.existsSync(LIVE_FILE)) {
      for (const line of fs.readFileSync(LIVE_FILE, 'utf8').split('\n')) {
        const tab = line.indexOf('\t')
        const text = tab >= 0 ? line.slice(tab + 1) : line
        if (text.trim()) texts.push(text.trim())
      }
    }
    for (const file of fs.readdirSync(CORPUS_DIR)) {
      if (!file.endsWith('.txt')) continue
      const content = fs.readFileSync(path.join(CORPUS_DIR, file), 'utf8')
      texts.push(...chunks(content))
    }
    const selected = texts.slice(-4000)
    let loss = 0
    for (const text of selected) loss += trainStep(text)
    state.trainRuns += 1
    state.trainSteps += selected.length
    state.trainedMessages = state.totalMessages
    state.lastTrainAt = new Date().toISOString()
    state.lastTrainDurationMs = Date.now() - started
    state.lastLoss = selected.length ? loss / selected.length : null
    state.modelVersion += 1
    fs.writeFileSync(MODEL_FILE, JSON.stringify({ version: state.modelVersion, trainedAt: state.lastTrainAt, reason, steps: selected.length, dim: DIM }))
    return { started: true, steps: selected.length, loss: state.lastLoss, durationMs: state.lastTrainDurationMs }
  } finally {
    state.learning = false
    writeState(state)
  }
}

function startAutoTrainer() {
  ensureDirs()
  const tick = async () => {
    const state = readState()
    if (!state.autoTrainEnabled || state.learning) return
    const pending = state.totalMessages - state.trainedMessages
    if (pending >= MIN_AUTO_TRAIN_MESSAGES) {
      await train('auto').catch((error) => logger.warn({ error }, 'mini-llm auto training failed'))
    }
  }
  setInterval(() => void tick(), AUTO_TRAIN_EVERY_MS).unref()
}

function searchContext(query: string, topK = 3) {
  const q = vector(query)
  const records = readRecords()
  return records
    .map((record) => {
      let score = 0
      for (let i = 0; i < Math.min(DIM, record.vector.length); i++) score += q[i]! * record.vector[i]!
      return { text: record.text, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

function getStats() {
  const state = readState()
  const records = readRecords()
  let corpusBytes = 0
  for (const dir of [CORPUS_DIR, ROOT]) {
    if (!fs.existsSync(dir)) continue
    for (const file of fs.readdirSync(dir)) {
      const full = path.join(dir, file)
      try { if (fs.statSync(full).isFile()) corpusBytes += fs.statSync(full).size } catch { /* ignore */ }
    }
  }
  return { ...state, pendingMessages: Math.max(0, state.totalMessages - state.trainedMessages), vectorRecords: records.length, corpusBytes }
}

function replyFromContext(query: string) {
  const context = searchContext(query, 3)
  if (!context.length) return 'Todavía no tengo suficiente conocimiento local para responder.'
  return [
    'Contexto aprendido localmente:',
    ...context.map((item, index) => `${index + 1}. ${item.text.slice(0, 500)}`),
  ].join('\n\n')
}

export const miniLLM = {
  ROOT,
  addLiveMessage,
  addDocumentFromMessage,
  train,
  getStats,
  searchContext,
  replyFromContext,
  startAutoTrainer,
  config: { dim: DIM, autoTrainEveryMs: AUTO_TRAIN_EVERY_MS, minAutoTrainMessages: MIN_AUTO_TRAIN_MESSAGES },
  hash: (text: string) => createHash('sha256').update(text).digest('hex'),
}
