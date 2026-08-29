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

function clean(text: string) {
  return text.normalize('NFKC').replace(/\\r/g, '\\n').replace(/[^\\p{L}\\p{N}\\p{P}\\p{Z}\\n]/gu, ' ').replace(/[ \\t]+/g, ' ').replace(/\\n{3,}/g, '\\n\\n').trim()
}
function splitChunks(text: string) {
  const value = clean(text); const chunks: string[] = []
  for (const paragraph of value.split(/\\n{2,}/)) for (let i = 0; i < paragraph.length; i += 900) { const part = paragraph.slice(i, i + 900).trim(); if (part) chunks.push(part) }
  return chunks
}
function hashVector(text: string) {
  const vector = new Float32Array(DIM); const lower = text.toLowerCase()
  for (let i = 0; i < lower.length; i++) { const a = lower.charCodeAt(i); const b = i + 1 < lower.length ? lower.charCodeAt(i + 1) : 0; const slot = (a * 31 + b * 17 + i * 13) % DIM; vector[slot] += ((a % 97) + 1) / 100 }
  let norm = 0; for (const value of vector) norm += value * value; norm = Math.sqrt(norm) || 1
  for (let i = 0; i < DIM; i++) vector[i] /= norm
  return vector
}
function nextVectorId() {
  if (!fs.existsSync(VECTORS_FILE)) return 1
  const buffer = fs.readFileSync(VECTORS_FILE); if (buffer.length < MAGIC.length || !buffer.subarray(0, MAGIC.length).equals(MAGIC)) return 1
  let offset = MAGIC.length; let max = 0
  while (offset + 6 <= buffer.length) {
    const id = buffer.readUInt32LE(offset); const length = buffer.readUInt16LE(offset + 4); offset += 6
    if (offset + DIM * 4 + length > buffer.length) break
    max = Math.max(max, id); offset += DIM * 4 + length
  }
  return max + 1
}
function appendVectors(texts: string[]) {
  fs.mkdirSync(ROOT, { recursive: true })
  if (!fs.existsSync(VECTORS_FILE) || fs.statSync(VECTORS_FILE).size === 0) fs.writeFileSync(VECTORS_FILE, MAGIC)
  const fd = fs.openSync(VECTORS_FILE, 'a'); let id = nextVectorId()
  try { for (const text of texts) { const vector = hashVector(text); const textBuffer = Buffer.from(text, 'utf8').subarray(0, 65535); const header = Buffer.alloc(6); header.writeUInt32LE(id++, 0); header.writeUInt16LE(textBuffer.length, 4); fs.writeSync(fd, header); fs.writeSync(fd, Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)); fs.writeSync(fd, textBuffer) } }
  finally { fs.closeSync(fd) }
  return texts.length
}

async function extractFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()
  if (!SUPPORTED.has(ext)) throw new Error(`Formato no compatible: ${ext || 'sin extensión'}`)
  if (ext === '.txt' || ext === '.md' || ext === '.csv' || ext === '.tsv' || ext === '.json' || ext === '.xml' || ext === '.html' || ext === '.htm') return clean(fs.readFileSync(filePath, 'utf8'))
  if (ext === '.pdf') {
    const mod = await import('pdf-parse') as unknown as { default?: new (options: { data: Uint8Array }) => { getText(): Promise<{ text: string }> } }
    if (!mod.default) throw new Error('pdf-parse no expone PDFParse.')
    const parser = new mod.default({ data: fs.readFileSync(filePath) })
    return clean((await parser.getText()).text)
  }
  const mammoth = await import('mammoth')
  return clean((await mammoth.extractRawText({ path: filePath })).value)
}

export async function ingestDocument(filePath: string) {
  const text = await extractFile(filePath)
  const chunks = splitChunks(text)
  if (!chunks.length) throw new Error('El documento no contiene texto utilizable.')
  const vocab = expandVocab(chunks)
  ensureModelVocabularySize(vocab.newSize)
  const vectors = appendVectors(chunks)
  return { characters: text.length, chunks: chunks.length, vectors, vocabAdded: vocab.added, vocabSize: vocab.newSize }
}

export function ingestLive(text: string) {
  const cleanText = clean(text)
  if (!cleanText) return { chunks: 0, vectors: 0, vocabAdded: 0, vocabSize: 0 }
  const chunks = splitChunks(cleanText)
  if (!chunks.length) return { chunks: 0, vectors: 0, vocabAdded: 0, vocabSize: 0 }
  const vocab = expandVocab(chunks)
  ensureModelVocabularySize(vocab.newSize)
  appendVectors(chunks)
  return { chunks: chunks.length, vectors: chunks.length, vocabAdded: vocab.added, vocabSize: vocab.newSize }
}

export function countCorpusDocuments() {
  if (!fs.existsSync(CORPUS_DIR)) return 0
  let count = 0
  const walk = (dir: string) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (SUPPORTED.has(path.extname(entry.name).toLowerCase())) count++ } }
  walk(CORPUS_DIR); return count
}
