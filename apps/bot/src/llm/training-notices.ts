import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'

const ROOT = path.resolve(config.dataDir, 'llm')
const FILE = path.join(ROOT, 'training-complete.json')

export type TrainingCompletionNotice = {
  id: string
  requestedBy: string
  completedAt: string
  run: number
  steps: number
  loss: number | null
  durationMs: number
  totalDocuments: number
  totalChunks: number
  vectorRecords: number
  vocabSize: number
  vocabLimit: number
  modelVersion: number
  storageBytes: number
  reason: string
}

function ensure() {
  fs.mkdirSync(ROOT, { recursive: true })
}

export function writeTrainingCompletionNotice(notice: TrainingCompletionNotice) {
  ensure()
  const temp = `${FILE}.tmp`
  fs.writeFileSync(temp, JSON.stringify(notice, null, 2))
  fs.renameSync(temp, FILE)
}

export function consumeTrainingCompletionNotice(): TrainingCompletionNotice | null {
  ensure()
  if (!fs.existsSync(FILE)) return null
  try {
    const notice = JSON.parse(fs.readFileSync(FILE, 'utf8')) as TrainingCompletionNotice
    fs.rmSync(FILE, { force: true })
    return notice
  } catch {
    return null
  }
}
