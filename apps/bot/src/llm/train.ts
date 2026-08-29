import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { loadCorpus } from './loader.js'
import { Embedding } from './embedding.js'
import { VectorStore } from './vector-store.js'
import { MiniTransformer } from './mini-transformer-model.js'

const ROOT = path.join(config.dataDir, 'llm')
const INPUT_DIR = path.join(ROOT, 'corpus')
const VOCAB_FILE = path.join(ROOT, 'vocab.json')
const VECTOR_FILE = path.join(ROOT, 'corpus.bin')
const MODEL_FILE = path.join(ROOT, 'model.bin')
const META_FILE = path.join(ROOT, 'training-meta.json')
const MAX_SENTENCES = 4000
const MAX_STEPS = 5000
const EPOCHS = 2
const YIELD_EVERY_STEPS = 25

function tokenize(text: string): string[] {
  return text.toLocaleLowerCase('es-MX').match(/[\p{L}\p{N}]+|[^\p{L}\p{N}\s]/gu) ?? []
}

function buildVocabulary(text: string[]): string[] {
  const counts = new Map<string, number>()
  for (const value of text) {
    for (const token of tokenize(value)) counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  return [
    '<unk>',
    '<bos>',
    '<eos>',
    ...[...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7997)
      .map(([token]) => token),
  ]
}

function saveVocabulary(vocab: string[]) {
  fs.mkdirSync(ROOT, { recursive: true })
  fs.writeFileSync(VOCAB_FILE, JSON.stringify({ version: 3, vocab, generatedAt: new Date().toISOString() }, null, 2))
}

function loadVocabulary(): string[] | null {
  try {
    const data = JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf8')) as { vocab?: string[] }
    return Array.isArray(data.vocab) && data.vocab.length >= 4 ? data.vocab : null
  } catch {
    return null
  }
}

function encode(text: string, vocab: string[], index: Map<string, number>): number[] {
  const unk = index.get('<unk>') ?? 0
  return tokenize(text).map((token) => index.get(token) ?? unk)
}

function writeTrainingMeta(patch: Record<string, unknown>) {
  fs.mkdirSync(ROOT, { recursive: true })
  let current: Record<string, unknown> = {}
  try { current = JSON.parse(fs.readFileSync(META_FILE, 'utf8')) as Record<string, unknown> } catch {}
  fs.writeFileSync(META_FILE, JSON.stringify({ ...current, ...patch }, null, 2))
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

export async function prepareCorpusAndTrain() {
  const corpus = await loadCorpus(INPUT_DIR)
  if (!corpus) return { ok: false as const, reason: 'empty_corpus' as const }

  const sentences = corpus
    .split(/[.!?\n]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 10)
    .slice(0, MAX_SENTENCES)

  if (!sentences.length) return { ok: false as const, reason: 'no_sentences' as const }

  let vocab = loadVocabulary()
  if (!vocab || vocab.length < 4) {
    vocab = buildVocabulary(sentences)
    saveVocabulary(vocab)
  }
  const index = new Map(vocab.map((token, id) => [token, id]))

  const embedder = new Embedding()
  embedder.train(sentences)
  const store = new VectorStore(128, VECTOR_FILE)
  let id = Date.now() & 0xffffffff
  for (const sentence of sentences) store.append(id++, embedder.get(sentence), sentence)

  const model = new MiniTransformer(vocab.length)
  const loadedExistingModel = model.load(MODEL_FILE)
  const totalEstimate = sentences.reduce((total, sentence) => {
    const length = encode(sentence, vocab!, index).length
    return total + Math.max(0, length - 1)
  }, 0) * EPOCHS

  let steps = 0
  let lossTotal = 0
  let lossCount = 0
  const startedAt = new Date().toISOString()

  writeTrainingMeta({
    version: 3,
    status: 'training',
    startedAt,
    characters: corpus.length,
    sentences: sentences.length,
    documentsDiscovered: countSupportedFiles(INPUT_DIR),
    epochs: EPOCHS,
    totalStepsEstimate: Math.min(MAX_STEPS, totalEstimate),
    currentStep: 0,
    currentEpoch: 1,
    averageLoss: null,
  })

  for (let epoch = 1; epoch <= EPOCHS && steps < MAX_STEPS; epoch++) {
    for (const sentence of sentences) {
      const ids = encode(sentence, vocab, index)
      if (ids.length < 2) continue
      for (let i = 1; i < ids.length && steps < MAX_STEPS; i++) {
        const loss = model.trainStep(ids.slice(Math.max(0, i - 32), i), ids[i]!)
        lossTotal += loss
        lossCount++
        steps++

        if (steps % YIELD_EVERY_STEPS === 0) {
          writeTrainingMeta({
            status: 'training',
            currentStep: steps,
            currentEpoch: epoch,
            totalStepsEstimate: Math.min(MAX_STEPS, totalEstimate),
            progress: Math.min(99, Math.round((steps / Math.max(1, Math.min(MAX_STEPS, totalEstimate))) * 100)),
            averageLoss: lossTotal / lossCount,
            updatedAt: new Date().toISOString(),
          })
          await yieldToEventLoop()
        }
      }
      if (steps >= MAX_STEPS) break
    }
  }

  model.save(MODEL_FILE)
  const averageLoss = lossCount ? lossTotal / lossCount : null
  const finishedAt = new Date().toISOString()
  fs.writeFileSync(META_FILE, JSON.stringify({
    version: 3,
    status: 'completed',
    startedAt,
    trainedAt: finishedAt,
    progress: 100,
    vocabSize: vocab.length,
    dim: model.dim,
    layers: model.layers,
    heads: model.heads,
    epochs: EPOCHS,
    steps,
    averageLoss,
    loadedExistingModel,
    documentsDiscovered: countSupportedFiles(INPUT_DIR),
    sentences: sentences.length,
    characters: corpus.length,
    currentStep: steps,
    currentEpoch: EPOCHS,
    totalStepsEstimate: Math.min(MAX_STEPS, totalEstimate),
  }, null, 2))

  return {
    ok: true as const,
    characters: corpus.length,
    sentences: sentences.length,
    vocab: vocab.length,
    vectorFile: VECTOR_FILE,
    modelFile: MODEL_FILE,
    steps,
    averageLoss,
    loadedExistingModel,
    documents: countSupportedFiles(INPUT_DIR),
  }
}

function countSupportedFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) total += countSupportedFiles(fullPath)
    else if (/\.(txt|pdf|docx)$/i.test(entry.name)) total++
  }
  return total
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  prepareCorpusAndTrain()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
