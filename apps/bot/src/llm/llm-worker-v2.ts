import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { miniLLM } from '../services/mini-llm-transformer.js'
import { getQueueState, updateDocumentJob } from './document-queue.js'
import { drainLiveMessages } from './live-queue.js'
import { consumeTrainingRequest } from './training-queue.js'
import { ingestDocument, ingestLive, countCorpusDocuments, migrateLegacyVectors, countVectors } from './incremental-corpus.js'
import { checkpointRound, ensureBaseCheckpoint, ensureModelVocabularySize, loadVocab } from './incremental-training.js'

const ROOT = path.resolve(config.dataDir, 'llm')
const STATE = path.join(ROOT, 'state.json')
const CORPUS = path.join(ROOT, 'corpus')
const POLL_MS = 2000
const LIVE_BATCH = 100
let busy = false

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) as Record<string, unknown> } catch { return {} }
}
function writeState(patch: Record<string, unknown>) {
  const current = readState(); const tmp = `${STATE}.tmp`
  fs.mkdirSync(ROOT, { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify({ ...current, ...patch }, null, 2)); fs.renameSync(tmp, STATE)
}
function trainRuns() {
  const value = Number(readState().trainRuns ?? 0)
  return Number.isInteger(value) && value >= 0 ? value : 0
}
function extractStateError(error: unknown) { return error instanceof Error ? `${error.name}: ${error.message}` : String(error) }

async function processDocuments() {
  const jobs = getQueueState().jobs.filter((job) => job.status === 'queued')
  let processed = 0
  for (const job of jobs) {
    updateDocumentJob(job.id, { status: 'processing', startedAt: new Date().toISOString(), error: undefined })
    try {
      if (!fs.existsSync(job.path)) throw new Error('El archivo de la cola ya no existe.')
      const target = path.join(CORPUS, `${job.id}-${job.filename}`)
      fs.renameSync(job.path, target)
      const result = await ingestDocument(target)
      updateDocumentJob(job.id, { status: 'completed', finishedAt: new Date().toISOString(), path: target })
      const state = readState()
      writeState({ totalDocuments: countCorpusDocuments(), totalChunks: Number(state.totalChunks ?? 0) + Number(result.chunks ?? 0), vectorRecords: countVectors(), currentMessage: `Documento procesado: ${job.filename}` })
      processed++
    } catch (error) {
      updateDocumentJob(job.id, { status: 'failed', finishedAt: new Date().toISOString(), error: extractStateError(error) })
      console.error(`[LLM worker] documento ${job.filename}:`, extractStateError(error))
    }
  }
  return processed
}

function processLiveMessages() {
  const messages = drainLiveMessages(LIVE_BATCH)
  if (!messages.length) return 0
  let added = 0
  for (const message of messages) {
    try { added += ingestLive(message).vectors } catch (error) { console.error('[LLM worker] mensaje vivo:', extractStateError(error)) }
  }
  writeState({ totalMessages: Number(readState().totalMessages ?? 0) + messages.length, vectorRecords: countVectors(), currentMessage: `Memoria viva: ${messages.length} mensajes` })
  return added
}

async function trainOnce(reason: string) {
  const currentRun = trainRuns()
  const nextRun = currentRun + 1
  const vocabBefore = loadVocab()
  if (vocabBefore.length === 0) throw new Error('No existe vocabulario base; no se permite reinicialización automática.')
  if (currentRun > 0) ensureBaseCheckpoint(currentRun)
  ensureModelVocabularySize(vocabBefore.length)

  // miniLLM.train() owns the learning lock. Never set learning=true here.
  writeState({ currentProgress: 0, currentStep: 0, currentTotalSteps: 0, currentEpoch: 0, currentTotalEpochs: Number(process.env.LLM_TRAIN_EPOCHS ?? 2), currentMessage: `Preparando vuelta ${nextRun} (${reason})`, vectorRecords: countVectors() })
  const result = await miniLLM.train(`incremental-${nextRun}`)
  if (!result.started) {
    writeState({ learning: false, currentMessage: `Entrenamiento no iniciado: ${result.reason}` })
    return result
  }
  const finalVocab = loadVocab()
  if (finalVocab.length < vocabBefore.length) throw new Error(`INVARIANTE: vocabulario final ${finalVocab.length} < base ${vocabBefore.length}. Abortado.`)
  checkpointRound(nextRun)
  writeState({ learning: false, currentProgress: 100, currentMessage: `Completado: vuelta ${nextRun}`, modelVersion: nextRun + 2, vectorRecords: countVectors() })
  return result
}

async function tick() {
  if (busy) return
  busy = true
  try {
    const docs = await processDocuments()
    const live = processLiveMessages()
    const request = consumeTrainingRequest()
    const state = readState()
    const totalMessages = Number(state.totalMessages ?? 0)
    const trainedMessages = Number(state.trainedMessages ?? 0)
    const autoEnabled = state.autoTrainEnabled !== false
    const lastTrain = state.lastTrainAt ? Date.parse(String(state.lastTrainAt)) : 0
    const autoDue = autoEnabled && Date.now() - lastTrain >= 30 * 60 * 1000 && totalMessages - trainedMessages >= 20
    if (docs > 0 || request) {
      try { await trainOnce(request ? 'manual' : 'document') } catch (error) { writeState({ learning: false, currentMessage: `Error: ${extractStateError(error)}` }); console.error('[LLM worker] entrenamiento:', extractStateError(error)) }
    } else if (autoDue) {
      try { await trainOnce('auto') } catch (error) { writeState({ learning: false, currentMessage: `Error: ${extractStateError(error)}` }); console.error('[LLM worker] auto-entrenamiento:', extractStateError(error)) }
    } else if (live > 0) {
      writeState({ currentMessage: `Memoria actualizada: ${live} vectores nuevos`, vectorRecords: countVectors() })
    }
  } finally { busy = false }
}

async function main() {
  fs.mkdirSync(ROOT, { recursive: true })
  const migratedVectors = migrateLegacyVectors()
  writeState({ learning: false, currentProgress: 0, currentStep: 0, currentTotalSteps: 0, currentTotalEpochs: 0, currentMessage: migratedVectors > 0 ? `Memoria migrada: ${migratedVectors} vectores` : 'En espera', vectorRecords: countVectors() })
  console.log(`[LLM worker v2] incremental activo; vectores migrados: ${migratedVectors}`)
  while (true) {
    try { await tick() } catch (error) { console.error('[LLM worker v2] tick:', extractStateError(error)) }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS))
  }
}

main().catch((error) => { console.error('[LLM worker v2] fatal:', extractStateError(error)); process.exitCode = 1 })
