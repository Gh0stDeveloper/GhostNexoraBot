import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CORPUS_SOURCES, type CorpusSource, getCorpusSource } from './corpus-sources.js'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve('data/llm/corpus')
const RAW = path.join(ROOT, 'raw')
const STATE_FILE = path.join(ROOT, 'download-state.json')
fs.mkdirSync(RAW, { recursive: true })

type DownloadState = { active: boolean; current?: string; completed: string[]; failed: string[]; startedAt?: string; finishedAt?: string }
const defaultState = (): DownloadState => ({ active: false, completed: [], failed: [] })
function loadState(): DownloadState { try { return { ...defaultState(), ...(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Partial<DownloadState>) } } catch { return defaultState() } }
function saveState(state: DownloadState) { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)) }

function downloadFile(url: string, dest: string, depth = 0): Promise<void> {
  if (depth > 5) return Promise.reject(new Error('Demasiadas redirecciones.'))
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const req = https.get(url, { headers: { 'User-Agent': 'GhostNexoraBot/1.0' } }, (res) => {
      const code = res.statusCode ?? 0
      if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
        res.resume(); file.close(); try { fs.unlinkSync(dest) } catch {}
        downloadFile(new URL(res.headers.location, url).toString(), dest, depth + 1).then(resolve, reject)
        return
      }
      if (code < 200 || code >= 300) { res.resume(); file.close(); try { fs.unlinkSync(dest) } catch {} ; reject(new Error(`HTTP ${code}`)); return }
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error', reject)
    })
    req.setTimeout(30_000, () => req.destroy(new Error('Timeout de descarga.')))
    req.on('error', (err) => { file.close(); try { fs.unlinkSync(dest) } catch {}; reject(err) })
  })
}

export function listSources(): CorpusSource[] { return CORPUS_SOURCES }
export function sourceStatus() {
  const state = loadState()
  return { state, files: fs.readdirSync(RAW, { withFileTypes: true }).filter((x) => x.isFile()).map((x) => ({ name: x.name, bytes: fs.statSync(path.join(RAW, x.name)).size })) }
}

export async function downloadSources(ids: string[]) {
  const unique = [...new Set(ids)]
  const state = loadState()
  state.active = true; state.startedAt = new Date().toISOString(); state.finishedAt = undefined; state.failed = []; state.current = undefined
  saveState(state)
  try {
    for (const id of unique) {
      const source = getCorpusSource(id)
      if (!source) { state.failed.push(id); continue }
      state.current = id; saveState(state)
      const dest = path.join(RAW, source.filename)
      try {
        await downloadFile(source.url, dest)
        if (source.filename.endsWith('.gz')) await execFileAsync('gzip', ['-df', dest])
        state.completed.push(id)
      } catch (error) {
        state.failed.push(id)
        try { fs.unlinkSync(dest) } catch {}
      }
      saveState(state)
    }
  } finally {
    state.active = false; state.current = undefined; state.finishedAt = new Date().toISOString(); saveState(state)
  }
  return sourceStatus()
}

export async function downloadDefaults() {
  const ids = CORPUS_SOURCES.filter((s) => s.enabledByDefault).map((s) => s.id)
  return downloadSources(ids)
}
