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

type DownloadState = {
  active: boolean
  current?: string
  completed: string[]
  failed: Array<{ id: string; error: string }>
  startedAt?: string
  finishedAt?: string
}

const defaultState = (): DownloadState => ({ active: false, completed: [], failed: [] })

function ensureDirs() {
  fs.mkdirSync(ROOT, { recursive: true })
  fs.mkdirSync(RAW, { recursive: true })
}

function loadState(): DownloadState {
  ensureDirs()
  try {
    const value = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Partial<DownloadState>
    return {
      ...defaultState(),
      ...value,
      failed: Array.isArray(value.failed)
        ? value.failed.map((item) => typeof item === 'string' ? { id: item, error: 'unknown' } : item)
        : [],
    }
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

function streamToFile(url: string, dest: string, depth = 0): Promise<void> {
  if (depth > 7) return Promise.reject(new Error('Demasiadas redirecciones.'))
  ensureDirs()
  const temp = `${dest}.part`
  return new Promise((resolve, reject) => {
    const finishError = (error: unknown) => {
      try { fs.unlinkSync(temp) } catch {}
      reject(error)
    }
    const req = https.get(url, {
      headers: {
        'User-Agent': 'GhostNexoraBot/1.1 (+https://github.com/Gh0stDeveloper/GhostNexoraBot)',
        Accept: '*/*',
      },
    }, (res) => {
      const code = res.statusCode ?? 0
      if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
        res.resume()
        streamToFile(new URL(res.headers.location, url).toString(), dest, depth + 1).then(resolve, reject)
        return
      }
      if (code < 200 || code >= 300) {
        res.resume()
        finishError(new Error(`HTTP ${code}`))
        return
      }
      const output = fs.createWriteStream(temp)
      res.pipe(output)
      res.on('error', finishError)
      output.on('error', finishError)
      output.on('finish', () => {
        output.close((error) => {
          if (error) {
            finishError(error)
            return
          }
          try {
            fs.renameSync(temp, dest)
            resolve()
          } catch (renameError) {
            finishError(renameError)
          }
        })
      })
    })
    req.setTimeout(120_000, () => req.destroy(new Error('Timeout de descarga.')))
    req.on('error', finishError)
  })
}

async function extractArchive(filePath: string) {
  if (filePath.endsWith('.tar.gz')) {
    const extractRoot = path.join(RAW, path.basename(filePath, '.tar.gz'))
    fs.mkdirSync(extractRoot, { recursive: true })
    await execFileAsync('tar', ['-xzf', filePath, '-C', extractRoot])
    fs.unlinkSync(filePath)
    return
  }
  if (filePath.endsWith('.gz')) {
    await execFileAsync('gzip', ['-df', filePath])
    return
  }
  if (filePath.endsWith('.bz2')) {
    await execFileAsync('bzip2', ['-df', filePath])
  }
}

export function listSources(): CorpusSource[] {
  return CORPUS_SOURCES
}

export function sourceStatus() {
  ensureDirs()
  const state = loadState()
  const files: Array<{ name: string; bytes: number; path: string }> = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(fullPath)
      else files.push({ name: path.relative(RAW, fullPath), bytes: fs.statSync(fullPath).size, path: fullPath })
    }
  }
  walk(RAW)
  return { state, files }
}

export async function downloadSources(ids: string[]) {
  ensureDirs()
  const unique = [...new Set(ids)]
  if (!unique.length) throw new Error('No se indicaron fuentes.')
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
        state.failed.push({ id, error: 'Fuente no encontrada.' })
        saveState(state)
        continue
      }
      state.current = id
      saveState(state)
      const dest = path.join(RAW, source.filename)
      try {
        await streamToFile(source.url, dest)
        await extractArchive(dest)
        if (!state.completed.includes(id)) state.completed.push(id)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        state.failed.push({ id, error: message })
        try { fs.unlinkSync(dest) } catch {}
        try { fs.unlinkSync(`${dest}.part`) } catch {}
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
