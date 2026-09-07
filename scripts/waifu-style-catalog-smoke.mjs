import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-waifu-style-catalog-'))
process.env.DATA_DIR = temp
process.env.ADMIN_WEB_TOKEN = 'waifu-style-catalog-ci-token'

try {
  const {
    listBotVisualStyles,
    listBotVisualStyleImages,
    setBotVisualStyleImage,
    getCurrentBotVisualStyle,
  } = await import('../apps/bot/dist/services/bot-styles-v13.js')

  const styles = listBotVisualStyles()
  const waifus = styles.filter((style) => style.id !== 'default')
  assert.equal(waifus.length, 23, 'the visual catalog must expose the 23 local waifus')
  assert.equal(waifus.some((style) => style.id === 'default'), false, 'Default must not be part of the waifu carousel')

  for (const waifu of waifus) {
    const images = listBotVisualStyleImages(waifu)
    assert.ok(images.length > 0, `${waifu.id} must expose local variants`)
  }

  const selected = setBotVisualStyleImage('rem', 2, 'ci@s.whatsapp.net', true)
  assert.equal(selected.style.id, 'rem')
  assert.equal(selected.image.index, 2)
  assert.equal(getCurrentBotVisualStyle().id, 'rem', 'choosing a variant must activate its waifu')

  const source = await readFile(new URL('../apps/bot/dist/commands/bot-styles-v13.js', import.meta.url), 'utf8')
  assert.equal(source.includes("style.id !== 'default'"), true, 'the main carousel must filter Default out')
  assert.equal(source.includes('Ver variantes'), true, 'waifu cards must open variants instead of applying immediately')
  assert.equal(source.includes('sendStylesNavigation'), true, 'main catalog navigation must be a separate interactive card')
  assert.equal(source.includes('sendVariantNavigation'), true, 'variant navigation must be a separate interactive card')
  assert.equal(source.includes('Navegación de estilos'), false, 'legacy navigation card must not be appended to the carousel')
  assert.equal(source.includes('Más imágenes'), false, 'legacy variant navigation card must not be appended to the carousel')
  assert.equal(source.includes('Seleccionar una waifu NO la aplica'), true, 'the variant-first contract must remain explicit')

  console.log(`[waifu-style-catalog] ${waifus.length} waifus · variant-first UI OK`)
} finally {
  await rm(temp, { recursive: true, force: true })
}
