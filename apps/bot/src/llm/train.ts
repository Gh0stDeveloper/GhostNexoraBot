import { requestTraining } from './training-queue.js'

export async function prepareCorpusAndTrain() {
  requestTraining('manual')
  return { ok: true as const, queued: true as const }
}

if (process.argv[1] && process.argv[1].endsWith('/train.js')) {
  requestTraining('cli')
  console.log(JSON.stringify({ ok: true, queued: true }))
}
