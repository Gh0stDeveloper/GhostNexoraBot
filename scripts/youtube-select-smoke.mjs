import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const { effectiveCommands } = await import('../apps/bot/dist/services/menu-registry.js')
await import('../apps/bot/dist/commands/index.js')
const effective = effectiveCommands()

const yts = effective.find((row) => row.tokens.includes('yts'))?.command
assert.ok(yts, 'missing effective .yts command')
assert.equal(yts.description.includes('Selecc'), true, '.yts must expose the select-first flow')

const ytformats = effective.find((row) => row.tokens.includes('ytformats'))?.command
assert.ok(ytformats, 'missing effective .ytformats command')
assert.equal(ytformats.description.includes('menú interactivo'), true, '.ytformats must resolve to the interactive selector')

// Fase 1 mueve la implementación real de Native Flow a la frontera WhatsApp.
// El servicio histórico queda como shim para no romper imports V1.
const interactiveSource = await readFile(new URL('../apps/bot/dist/platform/whatsapp/interactive.js', import.meta.url), 'utf8')
assert.equal(interactiveSource.includes("name: 'single_select'"), true, 'WhatsApp transport must support single_select')
assert.equal(interactiveSource.includes("...(row.description ? { description: row.description } : {})"), true, 'empty select descriptions must be omitted from payloads')

const interactiveShim = await readFile(new URL('../apps/bot/dist/services/interactive.js', import.meta.url), 'utf8')
assert.equal(interactiveShim.includes("../platform/whatsapp/interactive.js"), true, 'legacy interactive service must re-export the WhatsApp transport')

const youtubeSource = await readFile(new URL('../apps/bot/dist/commands/youtube-v3.js', import.meta.url), 'utf8')
for (const expected of [
  "text: 'Seleccionar'",
  'Audio MP3',
  'Audio como documento',
  'VIDEO NORMAL',
  'VIDEO COMO DOCUMENTO',
  'document: { url: result.filePath }',
  'Video ${quality}p',
]) {
  assert.equal(youtubeSource.includes(expected), true, `YouTube select flow missing: ${expected}`)
}
for (const quality of [144, 240, 360, 720]) {
  assert.equal(youtubeSource.includes(String(quality)), true, `YouTube select menu missing ${quality}p quality`)
}
for (const removed of [
  'Enviar como audio reproducible',
  'Archivo MP3 descargable',
  'El más liviano · datos justos',
  'Liviano · conexiones lentas',
  'Calidad estándar · recomendado',
  'HD · mejor disponible',
]) {
  assert.equal(youtubeSource.includes(removed), false, `selected YouTube rows must stay concise: ${removed}`)
}
assert.equal(youtubeSource.includes("text: '🎵 Audio'"), false, 'search carousel must not expose a separate Audio button')
assert.equal(youtubeSource.includes("text: '🎬 Video 720p'"), false, 'search carousel must not expose a separate Video button')

console.log('YouTube select-first smoke: OK')
