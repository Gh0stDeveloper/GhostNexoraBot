import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { expandVocab, ensureModelVocabularySize } from './incremental-training.js'

const ROOT = path.resolve(config.dataDir, 'llm')
const CORPUS_DIR = path.join(ROOT, 'corpus')
const VECTORS_FILE = path.join(ROOT, 'corpus.bin')
const DIM = 128
const MAGIC = Buffer.from('NXLLM2\\0', 'ascii')
const SUPPORTED = new Set(['.txt', '.md', '.csv', '.tsv', '.json', '.xml', '.html', '.htm', '.pdf', '.docx'])

type VectorRecord = { id: number; vector: Float32Array; text: string }

type PdfParseModule = {
  PDFParse?: new (options: { data: Buffer }) => {
    getText(): Promise<{ text: string }>
    destroy?: () => Promise<void> | void
  }
  default?: ((buffer: Buffer) => Promise<{ text?: string }>) | (new (options: { data: Buffer }) => { getText(): Promise<{ text: string }>; destroy?: () => Promise<void> | void })
}

function clean(text: string) {
  return text.normalize('NFKC').replace(/\r/g, '\n').replace(/[^\p{L}\p{N}\p{P}\p{Z}\n]/gu, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function splitChunks(text: string) {
  const value = clean(text); const chunks: string[] = []
  for (const paragraph of value.split(/\n{2,}/)) for (let i = 0; i < paragraph.length; i += 900) { const part = paragraph.slice(i, i + 900).trim(); if (part) chunks.push(part) }
  return chunks
}

function hashVector(text: string) {
  const vector = new Float32Array(DIM); const lower = text.toLowerCase()
  for (let i = 0; i < lower.length; i++) { const a = lower.charCodeAt(i); const b = i + 1 < lower.length ? lower.charCodeAt(i + 1) : 0; const slot = (a * 31 + b * 17 + i * 13) % DIM; vector[slot] += ((a % 97) + 1) / 100 }
  let norm = 0; for (const value of vector) norm += value * value; norm = Math.sqrt(norm) || 1
  for (let i = 0; i < DIM; i++) vector[i] /= norm
  return vector
}

function parseNewRecords(buffer: Buffer): VectorRecord[] {
  const out: VectorRecord[] = []; let offset = MAGIC.length
  while (offset + 6 <= buffer.length) {
    const id = buffer.readUInt32LE(offset); const textLength = buffer.readUInt16LE(offset + 4); offset += 6
    if (offset + DIM * 4 + textLength > buffer.length) throw new Error('corpus.bin nuevo está truncado.')
    const vector = new Float32Array(DIM); for (let i = 0; i < DIM; i++) vector[i] = buffer.readFloatLE(offset + i * 4)
    offset += DIM * 4; const text = buffer.subarray(offset, offset + textLength).toString('utf8'); offset += textLength
    out.push({ id, vector, text })
  }
  if (offset !== buffer.length) throw new Error('corpus.bin nuevo contiene bytes inválidos.')
  return out
}

function parseLegacyRecords(buffer: Buffer): VectorRecord[] {
  const out: VectorRecord[] = []; let offset = 0
  while (offset + 4 + DIM * 4 + 2 <= buffer.length) {
    const id = buffer.readUInt32LE(offset); offset += 4
    const vector = new Float32Array(DIM); for (let i = 0; i < DIM; i++) vector[i] = buffer.readFloatLE(offset + i * 4)
    offset += DIM * 4; const textLength = buffer.readUInt16LE(offset); offset += 2
    if (offset + textLength > buffer.length) throw new Error('corpus.bin antiguo está truncado.')
    const text = buffer.subarray(offset, offset + textLength).toString('utf8'); offset += textLength
    out.push({ id, vector, text })
  }
  if (offset !== buffer.length) throw new Error('corpus.bin antiguo contiene bytes inválidos.')
  return out
}

export function migrateLegacyVectors() {
  fs.mkdirSync(ROOT, { recursive: true })
  if (!fs.existsSync(VECTORS_FILE)) { fs.writeFileSync(VECTORS_FILE, MAGIC); return 0 }
  const buffer = fs.readFileSync(VECTORS_FILE)
  if (buffer.length === 0) { fs.writeFileSync(VECTORS_FILE, MAGIC); return 0 }
  try {
    if (buffer.subarray(0, MAGIC.length).equals(MAGIC)) return parseNewRecords(buffer).length
    const legacy = parseLegacyRecords(buffer)
    const payload: Buffer[] = [MAGIC]
    for (const item of legacy) {
      const textBuffer = Buffer.from(item.text, 'utf8').subarray(0, 65535)
      const header = Buffer.alloc(6); header.writeUInt32LE(item.id, 0); header.writeUInt16LE(textBuffer.length, 4)
      payload.push(header, Buffer.from(item.vector.buffer, item.vector.byteOffset, item.vector.byteLength), textBuffer)
    }
    const tmp = `${VECTORS_FILE}.migrate.tmp`; fs.writeFileSync(tmp, Buffer.concat(payload)); fs.renameSync(tmp, VECTORS_FILE)
    return legacy.length
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const backup = `${VECTORS_FILE}.invalid.${Date.now()}.bak`
    try { fs.renameSync(VECTORS_FILE, backup) } catch { try { fs.copyFileSync(VECTORS_FILE, backup); fs.rmSync(VECTORS_FILE, { force: true }) } catch {} }
    fs.writeFileSync(VECTORS_FILE, MAGIC)
    console.error(`[LLM] corpus.bin inválido; archivado como ${path.basename(backup)}: ${message}`)
    return 0
  }
}

function nextVectorId() {
  migrateLegacyVectors()
  if (!fs.existsSync(VECTORS_FILE)) return 1
  const records = parseNewRecords(fs.readFileSync(VECTORS_FILE))
  return records.length ? Math.max(...records.map((r) => r.id)) + 1 : 1
}

function appendVectors(texts: string[]) {
  fs.mkdirSync(ROOT, { recursive: true }); migrateLegacyVectors()
  if (!fs.existsSync(VECTORS_FILE) || fs.statSync(VECTORS_FILE).size === 0) fs.writeFileSync(VECTORS_FILE, MAGIC)
  const fd = fs.openSync(VECTORS_FILE, 'a'); let id = nextVectorId()
  try {
    for (const text of texts) {
      const vector = hashVector(text); const textBuffer = Buffer.from(text, 'utf8').subarray(0, 65535); const header = Buffer.alloc(6)
      header.writeUInt32LE(id++, 0); header.writeUInt16LE(textBuffer.length, 4)
      fs.writeSync(fd, header); fs.writeSync(fd, Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)); fs.writeSync(fd, textBuffer)
    }
  } finally { fs.closeSync(fd) }
  return texts.length
}

export function countVectors() {
  try { return migrateLegacyVectors() >= 0 ? parseNewRecords(fs.readFileSync(VECTORS_FILE)).length : 0 } catch (error) { console.error('[LLM] no se pudieron contar vectores:', error instanceof Error ? error.message : String(error)); return 0 }
}

async function extractPdfText(filePath: string): Promise<string> {
  const mod = await import('pdf-parse') as unknown as PdfParseModule
  const buffer = fs.readFileSync(filePath)
  if (typeof mod.PDFParse === 'function') {
    const parser = new mod.PDFParse({ data: buffer })
    try { return clean((await parser.getText()).text ?? '') } finally { await parser.destroy?.() }
  }
  const legacy = mod.default
  if (typeof legacy === 'function') return clean(String((await legacy(buffer)).text ?? ''))
  throw new Error('pdf-parse: API no reconocida (ni PDFParse ni función default).')
}

async function extractFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase(); if (!SUPPORTED.has(ext)) throw new Error(`Formato no compatible: ${ext || 'sin extensión'}`)
  if (['.txt', '.md', '.csv', '.tsv', '.json', '.xml', '.html', '.htm'].includes(ext)) return clean(fs.readFileSync(filePath, 'utf8'))
  if (ext === '.pdf') return extractPdfText(filePath)
  const mammoth = await import('mammoth'); return clean((await mammoth.extractRawText({ path: filePath })).value)
}

export async function ingestDocument(filePath: string) {
  const text = await extractFile(filePath); const chunks = splitChunks(text); if (!chunks.length) throw new Error('El documento no contiene texto utilizable.')
  const vocab = expandVocab(chunks); ensureModelVocabularySize(vocab.newSize); const vectors = appendVectors(chunks)
  return { characters: text.length, chunks: chunks.length, vectors, vocabAdded: vocab.added, vocabSize: vocab.newSize }
}

export function ingestLive(text: string) {
  const cleanText = clean(text); if (!cleanText) return { chunks: 0, vectors: 0, vocabAdded: 0, vocabSize: 0 }
  const chunks = splitChunks(cleanText); if (!chunks.length) return { chunks: 0, vectors: 0, vocabAdded: 0, vocabSize: 0 }
  const vocab = expandVocab(chunks); ensureModelVocabularySize(vocab.newSize); appendVectors(chunks); return { chunks: chunks.length, vectors: chunks.length, vocabAdded: vocab.added, vocabSize: vocab.newSize }
}

export function countCorpusDocuments() {
  if (!fs.existsSync(CORPUS_DIR)) return 0
  let count = 0; const walk = (dir: string) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (SUPPORTED.has(path.extname(entry.name).toLowerCase())) count++ } }
  walk(CORPUS_DIR); return count
}
