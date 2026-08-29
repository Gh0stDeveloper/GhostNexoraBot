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

  console.log('LLM modular smoke: OK')
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}
