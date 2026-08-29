import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { loadCorpus } from './loader.js'
import { Tokenizer } from './tokenizer.js'
import { Embedding } from './embedding.js'
import { VectorStore } from './vector-store.js'
import { miniLLM } from '../services/mini-llm.js'

const ROOT = path.join(config.dataDir, 'llm')
const INPUT_DIR = path.join(ROOT, 'corpus')
const BPE_FILE = path.join(ROOT, 'vocab-bpe.json')
const VECTOR_FILE = path.join(ROOT, 'corpus-v2.bin')

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
  for (const sentence of sentences.slice(0, 5000)) {
    store.append(id++, embedder.get(sentence), sentence)
  }

  const result = await miniLLM.train('corpus-import')
  return {
    ok: true as const,
    characters: corpus.length,
    sentences: sentences.length,
    vocab: tokenizer.vocab.size,
    vectorFile: VECTOR_FILE,
    training: result,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  prepareCorpusAndTrain()
    .then((result) => { console.log(JSON.stringify(result, null, 2)) })
    .catch((error) => { console.error(error); process.exitCode = 1 })
}
