import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const assetRoot = path.join(root, 'apps', 'bot', 'assets', 'waifus')
const bundleRoot = path.join(root, 'apps', 'bot', 'assets', 'waifus-bundle')
const manifestPath = path.join(assetRoot, 'manifest.json')

const expected = {
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

function assert(condition, message) {
  if (!condition) throw new Error(`[waifu-assets-smoke] ${message}`)
}

assert(fs.existsSync(path.join(bundleRoot, 'waifus.zip')), 'falta waifus.zip')
assert(fs.existsSync(path.join(bundleRoot, 'waifus1.zip')), 'falta waifus1.zip')
assert(fs.existsSync(manifestPath), 'npm run build no generó manifest.json')

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
assert(manifest.version === 2, `manifest version inesperada: ${manifest.version}`)
assert(manifest.count === 270, `manifest count=${manifest.count}; esperado 270`)
assert(Object.keys(manifest.styles ?? {}).length === 23, 'el manifest debe contener 23 waifus')
assert(Array.isArray(manifest.source) && manifest.source.join(',') === 'waifus.zip,waifus1.zip', 'fuentes ZIP inesperadas')

let total = 0
for (const [styleId, expectedCount] of Object.entries(expected)) {
  assert(manifest.styles?.[styleId] === expectedCount, `manifest inválido para ${styleId}`)
  const dir = path.join(assetRoot, styleId)
  assert(fs.existsSync(dir), `falta carpeta ${styleId}`)
  const files = fs.readdirSync(dir)
    .filter((name) => /\.(?:jpe?g|png|webp)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  assert(files.length === expectedCount, `${styleId}: ${files.length} imágenes; esperado ${expectedCount}`)
  files.forEach((name, offset) => {
    assert(name.startsWith(String(offset + 1).padStart(2, '0')), `${styleId}: orden no determinista en ${name}`)
    const file = path.join(dir, name)
    const stat = fs.statSync(file)
    assert(stat.size > 1_000, `${styleId}/${name} parece vacío (${stat.size} bytes)`)
    if (/\.jpe?g$/i.test(name)) {
      const head = fs.readFileSync(file).subarray(0, 3).toString('hex')
      assert(head === 'ffd8ff', `${styleId}/${name} no tiene firma JPEG válida`)
    }
  })
  total += files.length
}

assert(total === 270, `total local=${total}; esperado 270`)
assert(!fs.existsSync(path.join(assetRoot, 'megumi')), 'megumi debe normalizarse a megumin')

const styleService = fs.readFileSync(path.join(root, 'apps', 'bot', 'src', 'services', 'bot-styles-v13.ts'), 'utf8')
const styleCommand = fs.readFileSync(path.join(root, 'apps', 'bot', 'src', 'commands', 'bot-styles-v13.ts'), 'utf8')
assert(!/anilist/i.test(styleService), 'bot-styles-v13 no debe depender de AniList')
assert(styleCommand.includes('styleimg'), 'falta selector .styleimg')
assert(styleService.includes("const LOCAL_ASSET_ROOT"), 'falta resolver de assets locales')

console.log('[waifu-assets-smoke] OK · 270 imágenes · 23 waifus · ZIP locales · sin AniList en estilos')
