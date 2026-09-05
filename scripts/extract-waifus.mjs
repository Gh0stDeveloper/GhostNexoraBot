import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const workspaceRoot = process.cwd().endsWith(`${path.sep}apps${path.sep}bot`)
  ? path.resolve(process.cwd(), '../..')
  : process.cwd()

const bundleDir = path.join(workspaceRoot, 'apps', 'bot', 'assets', 'waifus-bundle')
const targetDir = path.join(workspaceRoot, 'apps', 'bot', 'assets', 'waifus')
const manifestPath = path.join(targetDir, 'manifest.json')
const markerPath = path.join(targetDir, '.bundle.sha256')
const SOURCE_ARCHIVES = ['waifus.zip', 'waifus1.zip']
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

const EXPECTED_STYLE_COUNTS = {
  asuna: 12,
  chiaki: 12,
  emilia: 12,
  frieren: 12,
  hinata: 12,
  kaguya: 12,
  kurumi: 11,
  mai: 12,
  makima: 12,
  marin: 11,
  megumin: 12,
  mikasa: 12,
  miku: 11,
  nami: 12,
  nezuko: 12,
  power: 11,
  rem: 12,
  rias: 10,
  robin: 12,
  tsukasa: 12,
  violet: 12,
  yor: 12,
  zerotwo: 12,
}

const STYLE_ALIASES = {
  megumi: 'megumin',
}

function canonicalStyleId(value) {
  const clean = String(value ?? '').trim().toLowerCase()
  return STYLE_ALIASES[clean] ?? clean
}

function validateManifest(manifest) {
  const styles = manifest?.styles ?? {}
  const expectedIds = Object.keys(EXPECTED_STYLE_COUNTS)
  if (Number(manifest?.count) !== 270) return false
  if (Object.keys(styles).length !== expectedIds.length) return false
  return expectedIds.every((id) => Number(styles[id]) === EXPECTED_STYLE_COUNTS[id])
}

function walkFiles(root) {
  const output = []
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) output.push(absolute)
    }
  }
  visit(root)
  return output
}

function styleFromSourcePath(filePath, extractionRoot) {
  const relative = path.relative(extractionRoot, filePath)
  const parts = relative.split(path.sep).slice(0, -1)
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const id = canonicalStyleId(parts[index])
    if (Object.hasOwn(EXPECTED_STYLE_COUNTS, id)) return id
  }
  return undefined
}

if (!existsSync(bundleDir)) {
  throw new Error(`No existe el directorio de assets locales: ${bundleDir}`)
}

const archivePaths = SOURCE_ARCHIVES.map((name) => path.join(bundleDir, name))
for (const archivePath of archivePaths) {
  if (!existsSync(archivePath) || statSync(archivePath).size < 1_000) {
    throw new Error(`Falta el paquete local de waifus: ${path.basename(archivePath)}`)
  }
}

try {
  execFileSync('unzip', ['-v'], { stdio: 'ignore' })
} catch {
  throw new Error('Se requiere el comando unzip para preparar los assets locales de waifus.')
}

const digestHash = createHash('sha256')
for (const archivePath of archivePaths) {
  digestHash.update(path.basename(archivePath), 'utf8')
  digestHash.update('\0')
  digestHash.update(readFileSync(archivePath))
  digestHash.update('\0')
}
const digest = digestHash.digest('hex')

if (existsSync(markerPath) && existsSync(manifestPath)) {
  const current = readFileSync(markerPath, 'utf8').trim()
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    manifest = undefined
  }
  if (current === digest && validateManifest(manifest)) {
    console.log(`[waifus] Assets locales listos · 270 imágenes · 23 waifus · bundle ${digest.slice(0, 12)}`)
    process.exit(0)
  }
}

const workDir = path.join(os.tmpdir(), `ghostnexora-waifus-${process.pid}-${Date.now()}`)
const preparedRoot = path.join(workDir, 'prepared')
const preparedWaifus = path.join(preparedRoot, 'waifus')
mkdirSync(preparedWaifus, { recursive: true })

try {
  const collected = []

  archivePaths.forEach((archivePath, archiveIndex) => {
    execFileSync('unzip', ['-tq', archivePath], { stdio: 'ignore' })
    const extractionRoot = path.join(workDir, `archive-${archiveIndex + 1}`)
    mkdirSync(extractionRoot, { recursive: true })
    execFileSync('unzip', ['-oq', archivePath, '-d', extractionRoot], { stdio: 'ignore' })

    for (const filePath of walkFiles(extractionRoot)) {
      const extension = path.extname(filePath).toLowerCase()
      if (!IMAGE_EXTENSIONS.has(extension)) continue
      const styleId = styleFromSourcePath(filePath, extractionRoot)
      if (!styleId) {
        throw new Error(`Imagen de waifu fuera de una carpeta reconocida: ${path.relative(extractionRoot, filePath)}`)
      }
      collected.push({
        archiveIndex,
        styleId,
        sourcePath: filePath,
        relativePath: path.relative(extractionRoot, filePath),
        extension,
      })
    }
  })

  collected.sort((a, b) => {
    const byStyle = a.styleId.localeCompare(b.styleId, 'en')
    if (byStyle) return byStyle
    const byArchive = a.archiveIndex - b.archiveIndex
    if (byArchive) return byArchive
    return a.relativePath.localeCompare(b.relativePath, 'en', { numeric: true })
  })

  if (collected.length !== 270) {
    throw new Error(`Los ZIP locales deben contener exactamente 270 imágenes; se encontraron ${collected.length}.`)
  }

  const grouped = new Map()
  for (const row of collected) {
    const list = grouped.get(row.styleId) ?? []
    list.push(row)
    grouped.set(row.styleId, list)
  }

  for (const [styleId, expectedCount] of Object.entries(EXPECTED_STYLE_COUNTS)) {
    const rows = grouped.get(styleId) ?? []
    if (rows.length !== expectedCount) {
      throw new Error(`Conteo inválido para ${styleId}: esperado ${expectedCount}, encontrado ${rows.length}.`)
    }

    const styleDir = path.join(preparedWaifus, styleId)
    mkdirSync(styleDir, { recursive: true })
    rows.forEach((row, offset) => {
      const fileName = `${String(offset + 1).padStart(2, '0')}${row.extension === '.jpeg' ? '.jpg' : row.extension}`
      copyFileSync(row.sourcePath, path.join(styleDir, fileName))
    })
  }

  const manifest = {
    version: 2,
    source: SOURCE_ARCHIVES,
    count: collected.length,
    styles: EXPECTED_STYLE_COUNTS,
  }
  writeFileSync(path.join(preparedWaifus, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  if (!validateManifest(manifest)) {
    throw new Error('El manifiesto generado de waifus no superó la validación final.')
  }

  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(path.dirname(targetDir), { recursive: true })
  renameSync(preparedWaifus, targetDir)
  writeFileSync(markerPath, `${digest}\n`, 'utf8')

  console.log(`[waifus] Extraídas 270 imágenes locales · 23 waifus · bundle ${digest.slice(0, 12)}`)
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
