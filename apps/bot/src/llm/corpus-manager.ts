import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { config } from '../config.js'
import { CORPUS_SOURCES, type CorpusSource, getCorpusSource } from './corpus-sources.js'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve(config.dataDir, 'llm', 'corpus')
const RAW = path.join(ROOT, 'raw')
const STATE_FILE = path.join(ROOT, 'download-state.json')

type DownloadState = { active: boolean; current?: string; completed: string[]; failed: string[]; startedAt?: string; finishedAt?: string }
const defaultState = (): DownloadState => ({ active: false, completed: [], failed: [] })

function ensureDirs() {
  fs.mkdirSync(ROOT, { recursive: true })
  fs.mkdirSync(RAW, { recursive: true })
}

function loadState(): DownloadState {
  ensureDirs()
  try {
    return { ...defaultState(), ...(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Partial<DownloadState>) }
  } catch {
    return defaultState()
  }
}

function saveState(state: DownloadState) {
  ensureDirs()
  const temp = `${STATE_FILE}.tmp`
  fs.writeFileSync(temp, JSON.stringify(state, null, 2))
  fs.renameSync(temp, STATE_FILE)
}

function downloadFile(url: string, dest: string, depth = 0): Promise<void> {
  if (depth > 5) return Promise.reject(new Error('Demasiadas redirecciones.'))
  ensureDirs()
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const cleanup = () => {
      file.destroy()
      try { fs.unlinkSync(dest) } catch {}
    }
    const req = https.get(url, { headers: { 'User-Agent': 'GhostNexoraBot/1.0' } }, (res) => {
      const code = res.statusCode ?? 0
      if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
        res.resume()
        file.close(() => undefined)
        cleanup()
        downloadFile(new URL(res.headers.location, url).toString(), dest, depth + 1).then(resolve, reject)
        return
      }
      if (code < 200 || code >= 300) {
        res.resume()
        file.close(() => undefined)
        cleanup()
        reject(new Error(`HTTP ${code}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => {
        file.close((error) => error ? reject(error) : resolve())
      })
      file.on('error', (error) => {
        cleanup()
        reject(error)
      })
    })
    req.setTimeout(30_000, () => req.destroy(new Error('Timeout de descarga.')))
    req.on('error', (error) => {
      cleanup()
      reject(error)
    })
  })
}

export function listSources(): CorpusSource[] {
  return CORPUS_SOURCES
}

export function sourceStatus() {
  ensureDirs()
  const state = loadState()
  return {
    state,
    files: fs.readdirSync(RAW, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => ({ name: entry.name, bytes: fs.statSync(path.join(RAW, entry.name)).size })),
  }
}

export async function downloadSources(ids: string[]) {
  ensureDirs()
  const unique = [...new Set(ids)]
  const state = loadState()
  state.active = true
  state.startedAt = new Date().toISOString()
  state.finishedAt = undefined
  state.failed = []
  state.current = undefined
  saveState(state)
  try {
    for (const id of unique) {
      const source = getCorpusSource(id)
      if (!source) {
        state.failed.push(id)
        saveState(state)
        continue
      }
      state.current = id
      saveState(state)
      const dest = path.join(RAW, source.filename)
      try {
        await downloadFile(source.url, dest)
        if (source.filename.endsWith('.gz')) await execFileAsync('gzip', ['-df', dest])
        if (!state.completed.includes(id)) state.completed.push(id)
      } catch {
        state.failed.push(id)
        try { fs.unlinkSync(dest) } catch {}
      }
      saveState(state)
    }
  } finally {
    state.active = false
    state.current = undefined
    state.finishedAt = new Date().toISOString()
    saveState(state)
  }
  return sourceStatus()
}

export async function downloadDefaults() {
  const ids = CORPUS_SOURCES.filter((source) => source.enabledByDefault).map((source) => source.id)
  return downloadSources(ids)
}
