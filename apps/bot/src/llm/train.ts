import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { loadCorpus } from './loader.js'
import { Tokenizer } from './tokenizer.js'
import { Embedding } from './embedding.js'
import { VectorStore } from './vector-store.js'
import { MiniTransformer } from './mini-transformer-model.js'

const ROOT = path.join(config.dataDir, 'llm')
const INPUT_DIR = path.join(ROOT, 'corpus')
const BPE_FILE = path.join(ROOT, 'vocab-bpe.json')
const VECTOR_FILE = path.join(ROOT, 'corpus-v2.bin')
const MODEL_FILE = path.join(ROOT, 'model-v3.bin')
const MAX_SENTENCES = 1200
const MAX_STEPS = 2000

export async function prepareCorpusAndTrain() {
  const corpus = await loadCorpus(INPUT_DIR)
  if (!corpus) return { ok: false as const, reason: 'empty_corpus' as const }

  const tokenizer = new Tokenizer()
  if (!tokenizer.load(BPE_FILE)) tokenizer.train(corpus, 5000)

  const embedder = new Embedding()
  const sentences = corpus.split(/[.!?\n]+/).map((value) => value.trim()).filter((value) => value.length > 10)
  embedder.train(sentences)

  const store = new VectorStore(128, VECTOR_FILE)
  let id = Date.now() & 0xffffffff
  for (const sentence of sentences.slice(0, 5000)) store.append(id++, embedder.get(sentence), sentence)

  const model = new MiniTransformer(tokenizer.vocab.size)
  const loaded = model.load(MODEL_FILE)
  let steps = 0
  let lossTotal = 0
  const dataset = sentences.slice(0, MAX_SENTENCES)
  for (const sentence of dataset) {
    const ids = tokenizer.encode(sentence).filter((value) => value >= 0 && value < model.vocabSize)
    for (let i = 1; i < ids.length && steps < MAX_STEPS; i++) {
      lossTotal += model.trainStep(ids.slice(Math.max(0, i - 32), i), ids[i]!)
      steps++
    }
    if (steps >= MAX_STEPS) break
  }
  model.save(MODEL_FILE)
  fs.writeFileSync(path.join(ROOT, 'model-v3.meta.json'), JSON.stringify({ version: 3, vocabSize: model.vocabSize, dim: model.dim, layers: model.layers, heads: model.heads, steps, averageLoss: steps ? lossTotal / steps : null, loadedExistingModel: loaded, trainedAt: new Date().toISOString() }, null, 2))

  return { ok: true as const, characters: corpus.length, sentences: sentences.length, vocab: tokenizer.vocab.size, vectorFile: VECTOR_FILE, modelFile: MODEL_FILE, steps, averageLoss: steps ? lossTotal / steps : null, loadedExistingModel: loaded }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  prepareCorpusAndTrain()
    .then((result) => { console.log(JSON.stringify(result, null, 2)) })
    .catch((error) => { console.error(error); process.exitCode = 1 })
}
