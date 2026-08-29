import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'

const ROOT = path.resolve(config.dataDir, 'llm')
const VOCAB_FILE = path.join(ROOT, 'vocab.json')
const MODEL_FILE = path.join(ROOT, 'model.bin')
const MAX_VOCAB = 8000
const DIM = 128
const MODEL_VERSION = 2

function ensure() {
  fs.mkdirSync(ROOT, { recursive: true })
}

function tokenize(text: string): string[] {
  return text.toLocaleLowerCase('es-MX').match(/[\p{L}\p{N}]+|[^\p{L}\p{N}\s]/gu) ?? []
}

function readModelVocabSize(): number | null {
  try {
    const buffer = fs.readFileSync(MODEL_FILE)
    const newline = buffer.indexOf(10)
    if (newline < 0) return null
    const meta = JSON.parse(buffer.subarray(0, newline).toString('utf8')) as { version?: number; vocabSize?: number; dim?: number; heads?: number }
    if (meta.version !== MODEL_VERSION || meta.dim !== DIM || meta.heads !== 4 || !Number.isInteger(meta.vocabSize)) return null
    return Number(meta.vocabSize)
  } catch {
    return null
  }
}

function healVocabToModelSize(vocab: string[]): string[] {
  const modelSize = readModelVocabSize()
  if (modelSize === null || modelSize <= vocab.length) return vocab
  if (modelSize > MAX_VOCAB) throw new Error(`El modelo requiere ${modelSize} tokens, por encima del límite ${MAX_VOCAB}.`)
  const seen = new Set(vocab)
  const healed = [...vocab]
  for (let i = healed.length; i < modelSize; i++) {
    let token = `__legacy_token_${i}`
    let n = 1
    while (seen.has(token)) token = `__legacy_token_${i}_${n++}`
    seen.add(token)
    healed.push(token)
  }
  saveVocab(healed)
  return healed
}

export function loadVocab(file = VOCAB_FILE): string[] {
  ensure()
  if (!fs.existsSync(file)) return []
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { vocab?: unknown }
  const vocab = Array.isArray(parsed.vocab) ? parsed.vocab.map(String) : []
  if (file === VOCAB_FILE) return healVocabToModelSize(vocab)
  return vocab
}

function saveVocab(vocab: string[], destination = VOCAB_FILE) {
  const tmp = `${destination}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ version: 2, vocab, generatedAt: new Date().toISOString() }, null, 2))
  fs.renameSync(tmp, destination)
}

export function expandVocab(texts: string[]): { oldSize: number; newSize: number; added: number } {
  ensure()
  const oldVocab = loadVocab()
  const baseline = oldVocab.length
  const seen = new Set(oldVocab)
  const counts = new Map<string, number>()
  for (const text of texts) for (const token of tokenize(text)) counts.set(token, (counts.get(token) ?? 0) + 1)
  const additions = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es-MX'))
    .map(([token]) => token)
    .filter((token) => !seen.has(token))
    .slice(0, Math.max(0, MAX_VOCAB - baseline))
  const next = [...oldVocab, ...additions]
  if (next.length < baseline) throw new Error(`INVARIANTE VIOLADA: vocabulario descendió de ${baseline} a ${next.length}. Entrenamiento abortado.`)
  saveVocab(next)
  return { oldSize: baseline, newSize: next.length, added: next.length - baseline }
}

function parseModel(buffer: Buffer) {
  const newline = buffer.indexOf(10)
  if (newline < 0) throw new Error('model.bin no contiene una cabecera válida.')
  const meta = JSON.parse(buffer.subarray(0, newline).toString('utf8')) as { version?: number; vocabSize?: number; dim?: number; heads?: number }
  if (meta.version !== MODEL_VERSION || meta.dim !== DIM || meta.heads !== 4 || !meta.vocabSize) throw new Error('model.bin incompatible con Mini-LLM v2.')
  const oldVocabSize = meta.vocabSize
  const oldEmbeddingBytes = oldVocabSize * DIM * 4
  const matrixBytes = DIM * DIM * 4
  const oldOutputBytes = DIM * oldVocabSize * 4
  const biasBytes = oldVocabSize * 4
  const payloadOffset = newline + 1
  const expected = payloadOffset + oldEmbeddingBytes + matrixBytes * 4 + oldOutputBytes + biasBytes
  if (buffer.length < expected) throw new Error('model.bin está truncado o corrupto.')
  return { newline, payloadOffset, oldVocabSize, oldEmbeddingBytes, matrixBytes, oldOutputBytes, biasBytes }
}

export function ensureModelVocabularySize(targetVocabSize: number) {
  ensure()
  if (!Number.isInteger(targetVocabSize) || targetVocabSize <= 0 || targetVocabSize > MAX_VOCAB) throw new Error(`Tamaño de vocabulario inválido: ${targetVocabSize}.`)
  if (!fs.existsSync(MODEL_FILE)) throw new Error('No existe model.bin; no se permite reinicializar un entrenamiento incremental sin un modelo base.')
  const buffer = fs.readFileSync(MODEL_FILE)
  const parsed = parseModel(buffer)
  const oldSize = parsed.oldVocabSize
  if (targetVocabSize < oldSize) throw new Error(`INVARIANTE VIOLADA: vocab nuevo ${targetVocabSize} < vocab anterior ${oldSize}. Entrenamiento abortado.`)
  if (targetVocabSize === oldSize) return { oldSize, newSize: targetVocabSize, expanded: false }

  const oldEmb = buffer.subarray(parsed.payloadOffset, parsed.payloadOffset + parsed.oldEmbeddingBytes)
  const cursorAfterEmb = parsed.payloadOffset + parsed.oldEmbeddingBytes
  const oldWq = buffer.subarray(cursorAfterEmb, cursorAfterEmb + parsed.matrixBytes)
  const oldWk = buffer.subarray(cursorAfterEmb + parsed.matrixBytes, cursorAfterEmb + parsed.matrixBytes * 2)
  const oldWv = buffer.subarray(cursorAfterEmb + parsed.matrixBytes * 2, cursorAfterEmb + parsed.matrixBytes * 3)
  const oldWo = buffer.subarray(cursorAfterEmb + parsed.matrixBytes * 3, cursorAfterEmb + parsed.matrixBytes * 4)
  const oldOutput = buffer.subarray(cursorAfterEmb + parsed.matrixBytes * 4, cursorAfterEmb + parsed.matrixBytes * 4 + parsed.oldOutputBytes)
  const oldBias = buffer.subarray(cursorAfterEmb + parsed.matrixBytes * 4 + parsed.oldOutputBytes, cursorAfterEmb + parsed.matrixBytes * 4 + parsed.oldOutputBytes + parsed.biasBytes)

  const seed = (index: number) => {
    const x = Math.sin(index * 12.9898 + 17.17) * 43758.5453
    return x - Math.floor(x)
  }
  const newEmb = Buffer.alloc(targetVocabSize * DIM * 4)
  oldEmb.copy(newEmb)
  for (let i = oldSize * DIM; i < targetVocabSize * DIM; i++) newEmb.writeFloatLE((seed(i + 101) - 0.5) * 0.08, i * 4)

  const newOutput = Buffer.alloc(DIM * targetVocabSize * 4)
  for (let row = 0; row < DIM; row++) {
    const oldRow = oldOutput.subarray(row * oldSize * 4, (row + 1) * oldSize * 4)
    oldRow.copy(newOutput, row * targetVocabSize * 4)
    for (let col = oldSize; col < targetVocabSize; col++) newOutput.writeFloatLE((seed(row * targetVocabSize + col + 1001) - 0.5) * 0.04, (row * targetVocabSize + col) * 4)
  }
  const newBias = Buffer.alloc(targetVocabSize * 4)
  oldBias.copy(newBias)
  const header = Buffer.from(JSON.stringify({ version: MODEL_VERSION, vocabSize: targetVocabSize, dim: DIM, heads: 4 }) + '\n')
  const temp = `${MODEL_FILE}.tmp`
  fs.writeFileSync(temp, Buffer.concat([header, newEmb, oldWq, oldWk, oldWv, oldWo, newOutput, newBias]))
  fs.renameSync(temp, MODEL_FILE)
  return { oldSize, newSize: targetVocabSize, expanded: true }
}

export function checkpointRound(round: number) {
  ensure()
  if (!fs.existsSync(MODEL_FILE) || !fs.existsSync(VOCAB_FILE)) throw new Error('No se puede crear checkpoint: faltan model.bin o vocab.json.')
  const modelDest = path.join(ROOT, `model-${round}.bin`)
  const vocabDest = path.join(ROOT, `vocab-${round}.json`)
  fs.copyFileSync(MODEL_FILE, modelDest)
  fs.copyFileSync(VOCAB_FILE, vocabDest)
  return { round, model: modelDest, vocab: vocabDest }
}

export function ensureBaseCheckpoint(round: number) {
  ensure()
  const modelDest = path.join(ROOT, `model-${round}.bin`)
  const vocabDest = path.join(ROOT, `vocab-${round}.json`)
  if (!fs.existsSync(modelDest) || !fs.existsSync(vocabDest)) return checkpointRound(round)
  return { round, model: modelDest, vocab: vocabDest }
}

export function restoreCheckpoint(round: number) {
  ensure()
  const modelSource = path.join(ROOT, `model-${round}.bin`)
  const vocabSource = path.join(ROOT, `vocab-${round}.json`)
  if (!fs.existsSync(modelSource) || !fs.existsSync(vocabSource)) throw new Error(`Falta el checkpoint de la vuelta ${round}.`)
  fs.copyFileSync(modelSource, MODEL_FILE)
  fs.copyFileSync(vocabSource, VOCAB_FILE)
  return { round, model: modelSource, vocab: vocabSource }
}

export function checkpointPaths() {
  ensure()
  return fs.readdirSync(ROOT).filter((name) => /^model-\d+\.bin$|^vocab-\d+\.json$/.test(name)).sort()
}
