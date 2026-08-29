import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { config } from '../config.js'

const ROOT = path.resolve(config.dataDir, 'llm')
const PID_FILE = path.join(ROOT, 'worker.pid')
const STATE_FILE = path.join(ROOT, 'state.json')

function writeState(patch: Record<string, unknown>) {
  fs.mkdirSync(ROOT, { recursive: true })
  let current: Record<string, unknown> = {}
  try { current = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Record<string, unknown> } catch {}
  const tmp = `${STATE_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ ...current, ...patch }, null, 2))
  fs.renameSync(tmp, STATE_FILE)
}

function cleanup() {
  try { fs.unlinkSync(PID_FILE) } catch {}
}

fs.mkdirSync(ROOT, { recursive: true })
fs.writeFileSync(PID_FILE, String(process.pid), { mode: 0o600 })

const child = spawn(process.execPath, [path.join(process.cwd(), 'apps/bot/dist/llm/llm-worker.js')], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env,
})

let shuttingDown = false
function stop(reason: string) {
  if (shuttingDown) return
  shuttingDown = true
  writeState({ learning: false, currentProgress: 0, currentStep: 0, currentTotalSteps: 0, currentMessage: reason })
  if (!child.killed) child.kill('SIGTERM')
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5000)
  timeout.unref()
  cleanup()
  process.exit(0)
}

process.on('SIGTERM', () => stop('Entrenamiento detenido por usuario'))
process.on('SIGINT', () => stop('Entrenamiento detenido por usuario'))

child.on('exit', (code, signal) => {
  cleanup()
  if (!shuttingDown) process.exit(signal ? 1 : (code ?? 0))
})

process.on('exit', cleanup)
