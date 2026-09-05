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

const binaryParts = readdirSync(bundleDir)
  .filter((name) => /^waifus-assets-v1\.part\d+\.bin$/i.test(name))
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
const base64Parts = readdirSync(bundleDir)
  .filter((name) => /^waifus-assets-v1\.b64\.part\d+$/i.test(name))
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))

function decodeStagedParts(names) {
  const chunks = names.map((name) => readFileSync(path.join(bundleDir, name)))
  const raw = Buffer.concat(chunks)
  if (raw.length >= 2 && raw[0] === 0x50 && raw[1] === 0x4b) return raw

  // GitHub's text-oriented connector may store a binary upload as Base64 text.
  // Detect that representation and decode the concatenated stream back to ZIP bytes.
  const encoded = raw.toString('utf8').replace(/\s+/g, '')
  if (!encoded || !/^[A-Za-z0-9+/=]+$/.test(encoded)) return raw
  return Buffer.from(encoded, 'base64')
}

let zip
if (binaryParts.length) {
  zip = decodeStagedParts(binaryParts)
} else if (base64Parts.length) {
  zip = decodeStagedParts(base64Parts)
} else {
  console.log('[waifus] No hay partes del bundle; se omite extracción.')
  process.exit(0)
}

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
  execFileSync('unzip', ['-tq', zipPath], { stdio: 'ignore' })
  execFileSync('unzip', ['-oq', zipPath, '-d', extractedRoot], { stdio: 'ignore' })
  const extractedWaifus = path.join(extractedRoot, 'waifus')
  if (!existsSync(path.join(extractedWaifus, 'manifest.json'))) {
    throw new Error('El bundle no contiene waifus/manifest.json.')
  }

  const manifest = JSON.parse(readFileSync(path.join(extractedWaifus, 'manifest.json'), 'utf8'))
  if (Number(manifest.count) !== 270 || Object.keys(manifest.styles ?? {}).length !== 23) {
    throw new Error(`Bundle de waifus incompleto: ${manifest.count ?? '?'} imágenes / ${Object.keys(manifest.styles ?? {}).length} estilos.`)
  }
  if (Number(manifest.styles?.megumin) !== 12) {
    throw new Error('El bundle no contiene correctamente el mapeo megumi → megumin.')
  }

  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(path.dirname(targetDir), { recursive: true })
  renameSync(extractedWaifus, targetDir)
  writeFileSync(markerPath, `${digest}\n`, 'utf8')

  console.log(`[waifus] Extraídas ${manifest.count} imágenes locales · ${Object.keys(manifest.styles).length} waifus · bundle ${digest.slice(0, 12)}`)
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
