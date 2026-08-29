import type { WASocket } from 'baileys'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { miniLLM } from '../services/mini-llm.js'
import { trainingQueueStatus } from './training-queue.js'

const ROOT = path.resolve(config.dataDir, 'llm')
const STATE_FILE = path.join(ROOT, 'state.json')
const POLL_MS = 5000

let socket: WASocket | null = null
let lastNotifiedTrainAt: string | null = null
let started = false

function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

function disableAutoTrain() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Record<string, unknown>
    if (state.autoTrainEnabled === false) return
    state.autoTrainEnabled = false
    const tmp = `${STATE_FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
    fs.renameSync(tmp, STATE_FILE)
  } catch {}
}

function buildCompletionMessage(stats: ReturnType<typeof miniLLM.stats>) {
  const duration = stats.lastTrainDurationMs > 0 ? `${(stats.lastTrainDurationMs / 60000).toFixed(1)} min` : 'N/D'
  return [
    '✅ *ENTRENAMIENTO LLM COMPLETADO*',
    '━━━━━━━━━━━━━━━━━━',
    `Entrenamiento » *${stats.trainRuns}*`,
    `Pasos de esta corrida » *${stats.currentStep}*`,
    `Pasos acumulados » *${stats.trainSteps}*`,
    `Último loss » *${stats.lastLoss?.toFixed(5) ?? 'N/D'}*`,
    `Mejor loss » *${stats.bestLoss?.toFixed(5) ?? 'N/D'}*`,
    `Duración » *${duration}*`,
    `Documentos » *${stats.totalDocuments}*`,
    `Fragmentos » *${stats.totalChunks}*`,
    `Vectores » *${stats.vectorRecords}*`,
    `Vocabulario » *${stats.vocabSize}/${miniLLM.constants.VOCAB_LIMIT}*`,
    `Modelo » *v${stats.modelVersion}*`,
    `Almacenamiento » *${formatBytes(stats.storageBytes)}*`,
    '',
    'Modelo y corpus guardados correctamente.',
    'No se eliminó ningún dato.',
    'Auto-entrenamiento » *DETENIDO AL FINALIZAR*',
  ].join('\n')
}

export function registerTrainingNotificationSocket(nextSocket: WASocket) {
  socket = nextSocket
}

export function startTrainingCompletionMonitor() {
  if (started) return
  started = true
  setInterval(async () => {
    try {
      const stats = miniLLM.stats()
      if (stats.learning) return
      const queue = trainingQueueStatus()
      const requestedAt = queue.lastRequestedAt ?? queue.requestedAt
      const target = queue.lastRequestedBy ?? queue.requestedBy
      const completedAt = stats.lastTrainAt
      if (!requestedAt || !target || !completedAt || !socket) return
      const requestedMs = Date.parse(requestedAt)
      const completedMs = Date.parse(completedAt)
      if (!Number.isFinite(requestedMs) || !Number.isFinite(completedMs) || completedMs < requestedMs) return
      if (stats.currentProgress !== 100 || !stats.currentMessage.toLowerCase().startsWith('completado:')) return
      if (lastNotifiedTrainAt === completedAt) return

      if (queue.lastStopAfterCurrent !== false) disableAutoTrain()
      await socket.sendMessage(target, { text: buildCompletionMessage(stats) })
      lastNotifiedTrainAt = completedAt
    } catch {}
  }, POLL_MS)
}
