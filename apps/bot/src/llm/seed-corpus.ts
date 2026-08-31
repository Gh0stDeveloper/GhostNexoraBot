import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { ingestDocument } from './incremental-corpus.js'

const ROOT = path.resolve(config.dataDir, 'llm')
const CORPUS = path.join(ROOT, 'corpus')
const SEED_MARKER = path.join(ROOT, 'seed-installed.json')

function packageSeedDir() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(here, '../../data/llm-seed'),
    path.resolve(here, '../../../data/llm-seed'),
    path.resolve(process.cwd(), 'apps/bot/data/llm-seed'),
    path.resolve(process.cwd(), 'data/llm-seed'),
    path.resolve('/opt/ghost-nexora-bot/apps/bot/data/llm-seed'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return null
}

export async function installSeedCorpus(force = false) {
  const source = packageSeedDir()
  if (!source) return { ok: false as const, reason: 'seed_not_found' as const, installed: 0, chunks: 0 }
  if (!force && fs.existsSync(SEED_MARKER)) {
    try {
      const prev = JSON.parse(fs.readFileSync(SEED_MARKER, 'utf8')) as { files?: string[] }
      return { ok: true as const, reason: 'already_installed' as const, installed: prev.files?.length ?? 0, chunks: 0 }
    } catch {
      // continue
    }
  }

  fs.mkdirSync(CORPUS, { recursive: true })
  const files = fs
    .readdirSync(source)
    .filter((name) => /\.(txt|md)$/i.test(name))
    .sort()
  const installed: string[] = []
  let chunks = 0
  for (const name of files) {
    const from = path.join(source, name)
    const to = path.join(CORPUS, `seed-${name}`)
    fs.copyFileSync(from, to)
    try {
      const result = await ingestDocument(to)
      chunks += result.chunks
      installed.push(name)
    } catch (error) {
      console.error('[LLM seed]', name, error)
    }
  }
  fs.writeFileSync(
    SEED_MARKER,
    JSON.stringify(
      { installedAt: new Date().toISOString(), files: installed, chunks, force, source },
      null,
      2,
    ),
  )
  return { ok: true as const, reason: 'installed' as const, installed: installed.length, chunks }
}

export function getSeedSourceDir() {
  return packageSeedDir()
}
