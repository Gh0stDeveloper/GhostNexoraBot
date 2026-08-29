import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'

type TrainingState = {
  requested: boolean
  reason?: string
  requestedAt?: string
  requestedBy?: string
  stopAfterCurrent?: boolean
  lastRequestedAt?: string
  lastRequestedBy?: string
  lastStopAfterCurrent?: boolean
}

const ROOT = path.resolve(config.dataDir, 'llm')
const FILE = path.join(ROOT, 'training-queue.json')

function ensure() { fs.mkdirSync(ROOT, { recursive: true }) }
function read(): TrainingState { ensure(); try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) as TrainingState } catch { return { requested: false } } }
function write(value: TrainingState) { ensure(); const temp = `${FILE}.tmp`; fs.writeFileSync(temp, JSON.stringify(value, null, 2)); fs.renameSync(temp, FILE) }

export function requestTraining(reason = 'manual', requestedBy?: string, stopAfterCurrent = true) {
  const state = read()
  state.requested = true
  state.reason = reason
  state.requestedAt = new Date().toISOString()
  state.requestedBy = requestedBy
  state.stopAfterCurrent = stopAfterCurrent
  state.lastRequestedAt = state.requestedAt
  state.lastRequestedBy = requestedBy
  state.lastStopAfterCurrent = stopAfterCurrent
  write(state)
}

export function consumeTrainingRequest() {
  const state = read()
  if (!state.requested) return null
  state.requested = false
  write({
    requested: false,
    lastRequestedAt: state.requestedAt ?? state.lastRequestedAt,
    lastRequestedBy: state.requestedBy ?? state.lastRequestedBy,
    lastStopAfterCurrent: state.stopAfterCurrent !== false,
  })
  return {
    reason: state.reason ?? 'manual',
    requestedAt: state.requestedAt,
    requestedBy: state.requestedBy,
    stopAfterCurrent: state.stopAfterCurrent !== false,
  }
}

export function trainingQueueStatus() { return read() }
