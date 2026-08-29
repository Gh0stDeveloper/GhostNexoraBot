import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'

type TrainingState = {
  requested: boolean
  reason?: string
  requestedAt?: string
}

const ROOT = path.resolve(config.dataDir, 'llm')
const FILE = path.join(ROOT, 'training-queue.json')

function ensure() { fs.mkdirSync(ROOT, { recursive: true }) }
function read(): TrainingState { ensure(); try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) as TrainingState } catch { return { requested: false } } }
function write(value: TrainingState) { ensure(); const temp = `${FILE}.tmp`; fs.writeFileSync(temp, JSON.stringify(value, null, 2)); fs.renameSync(temp, FILE) }

export function requestTraining(reason = 'manual') {
  const state = read()
  state.requested = true
  state.reason = reason
  state.requestedAt = new Date().toISOString()
  write(state)
}

export function consumeTrainingRequest() {
  const state = read()
  if (!state.requested) return null
  state.requested = false
  write(state)
  return { reason: state.reason ?? 'manual', requestedAt: state.requestedAt }
}

export function trainingQueueStatus() { return read() }
