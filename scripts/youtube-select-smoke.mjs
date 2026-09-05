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

const interactiveSource = await readFile(new URL('../apps/bot/dist/services/interactive.js', import.meta.url), 'utf8')
assert.equal(interactiveSource.includes("name: 'single_select'"), true, 'interactive service must support WhatsApp single_select')

const youtubeSource = await readFile(new URL('../apps/bot/dist/commands/youtube-v3.js', import.meta.url), 'utf8')
for (const expected of [
  "text: 'Seleccionar'",
  'Audio MP3',
  'Audio como documento',
  'VIDEO NORMAL',
  'VIDEO COMO DOCUMENTO',
  'document: { url: result.filePath }',
  'Video ${quality.value}p',
]) {
  assert.equal(youtubeSource.includes(expected), true, `YouTube select flow missing: ${expected}`)
}
for (const quality of [144, 240, 360, 720]) {
  assert.equal(youtubeSource.includes(`value: ${quality}`), true, `YouTube select menu missing ${quality}p quality`)
}
assert.equal(youtubeSource.includes("text: '🎵 Audio'"), false, 'search carousel must not expose a separate Audio button')
assert.equal(youtubeSource.includes("text: '🎬 Video 720p'"), false, 'search carousel must not expose a separate Video button')

console.log('YouTube select-first smoke: OK')
