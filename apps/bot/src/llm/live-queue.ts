import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'

const ROOT = path.resolve(config.dataDir, 'llm')
const FILE = path.join(ROOT, 'live-queue.jsonl')

function ensure() { fs.mkdirSync(ROOT, { recursive: true }) }

export function enqueueLiveMessage(text: string) {
  const value = text.trim()
  if (!value) return
  ensure()
  fs.appendFileSync(FILE, JSON.stringify({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text: value, createdAt: new Date().toISOString() }) + '\n')
}

export function drainLiveMessages(limit = 100) {
  ensure()
  if (!fs.existsSync(FILE)) return [] as string[]
  const lines = fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean)
  if (!lines.length) return [] as string[]
  const selected = lines.slice(0, limit)
  const remaining = lines.slice(limit)
  const temp = `${FILE}.tmp`
  fs.writeFileSync(temp, remaining.length ? `${remaining.join('\n')}\n` : '')
  fs.renameSync(temp, FILE)
  const out: string[] = []
  for (const line of selected) {
    try {
      const row = JSON.parse(line) as { text?: string }
      if (typeof row.text === 'string' && row.text.trim()) out.push(row.text)
    } catch {}
  }
  return out
}

export function liveQueueSize() {
  ensure()
  try { return fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).length } catch { return 0 }
}
