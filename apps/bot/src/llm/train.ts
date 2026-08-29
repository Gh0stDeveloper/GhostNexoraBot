import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { requestTraining } from './training-queue.js'

const LLM_DIR = path.join(config.dataDir, 'llm')
const VOCAB_FILE = path.join(LLM_DIR, 'vocab.json')
const CHECKPOINT_DIR = path.join(LLM_DIR, 'checkpoints')

function ensureDirs() {
  fs.mkdirSync(LLM_DIR, { recursive: true })
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true })
}

function readVocabSize(): number {
  try {
    const data = JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf8')) as { vocab?: unknown[] }
    return Array.isArray(data.vocab) ? data.vocab.length : 0
  } catch {
    return 0
  }
}

function checkpointNumberFromName(name: string): number {
  const match = name.match(/model-(\d+)\.bin$/)
  return match ? Number(match[1]) : 0
}

export function getLatestCheckpoint() {
  ensureDirs()
  const candidates = fs.readdirSync(CHECKPOINT_DIR)
    .map((name) => ({ name, run: checkpointNumberFromName(name) }))
    .filter((item) => item.run > 0)
    .sort((a, b) => b.run - a.run)

  const run = candidates[0]?.run ?? Math.max(0, readCompletedTrainRuns())
  if (run <= 0) return null

  const model = path.join(CHECKPOINT_DIR, `model-${run}.bin`)
  const vocab = path.join(CHECKPOINT_DIR, `vocab-${run}.json`)
  return fs.existsSync(model) && fs.existsSync(vocab)
    ? { run, model, vocab }
    : null
}

function readCompletedTrainRuns(): number {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(LLM_DIR, 'state.json'), 'utf8')) as { trainRuns?: number }
    return Number.isFinite(state.trainRuns) ? Number(state.trainRuns) : 0
  } catch {
    return 0
  }
}

export async function prepareCorpusAndTrain() {
  ensureDirs()
  const latest = getLatestCheckpoint()
  const currentVocab = readVocabSize()

  requestTraining('manual')

  return {
    ok: true as const,
    queued: true as const,
    baseRun: latest?.run ?? 0,
    baseModel: latest?.model ?? null,
    vocabSize: currentVocab,
    nextRun: (latest?.run ?? 0) + 1,
  }
}

if (process.argv[1] && process.argv[1].endsWith('/train.js')) {
  const result = await prepareCorpusAndTrain()
  console.log(JSON.stringify(result))
}
