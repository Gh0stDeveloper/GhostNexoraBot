import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const workspaceRoot = process.cwd().endsWith(`${path.sep}apps${path.sep}bot`)
  ? path.resolve(process.cwd(), '../..')
  : process.cwd()

const bundleDir = path.join(workspaceRoot, 'apps', 'bot', 'assets', 'waifus-bundle')
const targetDir = path.join(workspaceRoot, 'apps', 'bot', 'assets', 'waifus')
const manifestPath = path.join(targetDir, 'manifest.json')
const markerPath = path.join(targetDir, '.bundle.sha256')

if (!existsSync(bundleDir)) {
  console.log('[waifus] Bundle local no encontrado; se omite extracción.')
  process.exit(0)
}

const parts = readdirSync(bundleDir)
  .filter((name) => /^waifus-assets-v1\.b64\.part\d+$/i.test(name))
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))

if (!parts.length) {
  console.log('[waifus] No hay partes del bundle; se omite extracción.')
  process.exit(0)
}

const base64 = parts.map((name) => readFileSync(path.join(bundleDir, name), 'utf8').trim()).join('')
const zip = Buffer.from(base64, 'base64')
if (zip.length < 4 || zip[0] !== 0x50 || zip[1] !== 0x4b) {
  throw new Error('El bundle local de waifus no es un ZIP válido.')
}

const digest = createHash('sha256').update(zip).digest('hex')
if (existsSync(markerPath) && existsSync(manifestPath)) {
  const current = readFileSync(markerPath, 'utf8').trim()
  if (current === digest) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    console.log(`[waifus] Assets locales listos · ${manifest.count ?? '?'} imágenes · bundle ${digest.slice(0, 12)}`)
    process.exit(0)
  }
}

try {
  execFileSync('unzip', ['-v'], { stdio: 'ignore' })
} catch {
  throw new Error('Se requiere el comando unzip para preparar los assets locales de waifus.')
}

const workDir = path.join(os.tmpdir(), `ghostnexora-waifus-${process.pid}-${Date.now()}`)
const zipPath = path.join(workDir, 'waifus.zip')
const extractedRoot = path.join(workDir, 'out')
mkdirSync(extractedRoot, { recursive: true })
writeFileSync(zipPath, zip)

try {
  execFileSync('unzip', ['-oq', zipPath, '-d', extractedRoot], { stdio: 'ignore' })
  const extractedWaifus = path.join(extractedRoot, 'waifus')
  if (!existsSync(path.join(extractedWaifus, 'manifest.json'))) {
    throw new Error('El bundle no contiene waifus/manifest.json.')
  }

  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(path.dirname(targetDir), { recursive: true })
  renameSync(extractedWaifus, targetDir)
  writeFileSync(markerPath, `${digest}\n`, 'utf8')

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  console.log(`[waifus] Extraídas ${manifest.count ?? '?'} imágenes locales · ${Object.keys(manifest.styles ?? {}).length} waifus · bundle ${digest.slice(0, 12)}`)
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
