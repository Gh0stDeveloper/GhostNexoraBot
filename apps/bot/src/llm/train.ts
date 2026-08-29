import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { requestTraining } from './training-queue.js'

const LLM_DIR = path.join(config.dataDir, 'llm')
const VOCAB_FILE = path.join(LLM_DIR, 'vocab.json')

function ensureDirs() { fs.mkdirSync(LLM_DIR, { recursive: true }) }
function readVocabSize(): number {
  try {
    const data = JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf8')) as { vocab?: unknown[] }
    return Array.isArray(data.vocab) ? data.vocab.length : 0
  } catch { return 0 }
}
function listCheckpointRuns() {
  ensureDirs()
  const runs = new Set<number>()
  for (const name of fs.readdirSync(LLM_DIR)) {
    const model = name.match(/^model-(\d+)\.bin$/); const vocab = name.match(/^vocab-(\d+)\.json$/)
    if (model) runs.add(Number(model[1])); if (vocab) runs.add(Number(vocab[1]))
  }
  return [...runs].filter((run) => run > 0).sort((a, b) => b - a)
}
function readCompletedTrainRuns(): number {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(LLM_DIR, 'state.json'), 'utf8')) as { trainRuns?: number }
    return Number.isFinite(state.trainRuns) ? Number(state.trainRuns) : 0
  } catch { return 0 }
}
export function getLatestCheckpoint() {
  ensureDirs()
  const run = listCheckpointRuns().find((candidate) => fs.existsSync(path.join(LLM_DIR, `model-${candidate}.bin`)) && fs.existsSync(path.join(LLM_DIR, `vocab-${candidate}.json`))) ?? 0
  if (run <= 0) return null
  return { run, model: path.join(LLM_DIR, `model-${run}.bin`), vocab: path.join(LLM_DIR, `vocab-${run}.json`) }
}
export async function prepareCorpusAndTrain() {
  ensureDirs()
  const latest = getLatestCheckpoint()
  const currentRun = readCompletedTrainRuns()
  const currentVocab = readVocabSize()
  requestTraining('manual')
  return { ok: true as const, queued: true as const, baseRun: latest?.run ?? currentRun, baseModel: latest?.model ?? null, vocabSize: currentVocab, nextRun: (latest?.run ?? currentRun) + 1 }
}
if (process.argv[1] && process.argv[1].endsWith('/train.js')) console.log(JSON.stringify(await prepareCorpusAndTrain()))
