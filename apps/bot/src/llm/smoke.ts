import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadCorpus } from './loader.js'
import { Tokenizer } from './tokenizer.js'
import { Embedding } from './embedding.js'
import { VectorStore } from './vector-store.js'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-llm-'))
try {
  const corpusDir = path.join(temp, 'corpus')
  fs.mkdirSync(corpusDir, { recursive: true })
  fs.writeFileSync(path.join(corpusDir, 'sample.txt'), 'Ghost Nexora aprende de documentos locales. Este texto sirve como prueba del corpus.')

  const corpus = await loadCorpus(corpusDir)
  assert.match(corpus, /ghost nexora/i)

  const tokenizer = new Tokenizer()
  tokenizer.train(corpus, 30)
  const encoded = tokenizer.encode('ghost nexora')
  assert.ok(encoded.length > 0)
  assert.ok(tokenizer.decode(encoded).length > 0)

  const embedding = new Embedding()
  embedding.train([corpus])
  const vector = embedding.get('ghost nexora')
  assert.equal(vector.length, 128)

  const store = new VectorStore(128, path.join(temp, 'vectors.bin'))
  store.append(1, vector, 'Ghost Nexora aprende localmente')
  const hits = store.search(vector, 1)
  assert.equal(hits.length, 1)
  assert.equal(hits[0]?.id, 1)

  // Incremental-training smoke: preserve the old vocabulary, expand only with new tokens,
  // preserve existing model bytes, and create a round checkpoint.
  process.env.DATA_DIR = temp
  const incremental = await import('./incremental-training.js')
  const llmDir = path.join(temp, 'llm')
  fs.mkdirSync(llmDir, { recursive: true })
  fs.writeFileSync(path.join(llmDir, 'vocab.json'), JSON.stringify({ version: 2, vocab: ['<unk>', '<bos>', '<eos>', 'ghost'] }))

  const dim = 128
  const vocabSize = 4
  const header = Buffer.from(JSON.stringify({ version: 2, vocabSize, dim, heads: 4 }) + '\n')
  const emb = new Float32Array(vocabSize * dim)
  const w = new Float32Array(dim * dim)
  const output = new Float32Array(vocabSize * dim)
  const bias = new Float32Array(vocabSize)
  emb.fill(0.125); w.fill(0.25); output.fill(0.5); bias.fill(0.75)
  fs.writeFileSync(path.join(llmDir, 'model.bin'), Buffer.concat([
    header,
    Buffer.from(emb.buffer),
    Buffer.from(w.buffer), Buffer.from(w.buffer), Buffer.from(w.buffer), Buffer.from(w.buffer),
    Buffer.from(output.buffer), Buffer.from(bias.buffer),
  ]))

  const expanded = incremental.expandVocab(['ghost nuevo token'])
  assert.ok(expanded.newSize >= expanded.oldSize)
  const nextVocab = incremental.loadVocab()
  assert.deepEqual(nextVocab.slice(0, 4), ['<unk>', '<bos>', '<eos>', 'ghost'])
  assert.equal(nextVocab.length, expanded.newSize)

  incremental.ensureModelVocabularySize(expanded.newSize)
  const modelBuffer = fs.readFileSync(path.join(llmDir, 'model.bin'))
  const split = modelBuffer.indexOf(10)
  const meta = JSON.parse(modelBuffer.subarray(0, split).toString('utf8')) as { vocabSize: number }
  assert.equal(meta.vocabSize, expanded.newSize)
  assert.equal(modelBuffer.readFloatLE(split + 1), 0.125)

  incremental.checkpointRound(2)
  assert.ok(fs.existsSync(path.join(llmDir, 'model-2.bin')))
  assert.ok(fs.existsSync(path.join(llmDir, 'vocab-2.json')))

  console.log('LLM modular + incremental smoke: OK')
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}
