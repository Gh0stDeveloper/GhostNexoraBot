#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const expected = ['pacman', 'buscaminas', 'halo', 'pianotiles', 'bounce']
const { commands } = await import('../apps/bot/dist/commands/index.js')
for (const name of expected) {
  const matches = commands.filter((command) => command.name === name)
  assert.equal(matches.length, 1, `${name} must be registered exactly once`)
  assert.equal(matches[0].category, 'games', `${name} must be in games category`)
}

const arcade = await import('../apps/bot/dist/services/arcade-games-v16.js')
const builders = [
  arcade.buildPacmanGameHtml,
  arcade.buildMinesweeperGameHtml,
  arcade.buildHaloArenaGameHtml,
  arcade.buildPianoTilesGameHtml,
  arcade.buildBounceGameHtml,
]
for (const build of builders) {
  const html = build()
  assert.ok(html.length > 1500, 'game HTML should contain the playable implementation')
  assert.ok(html.length < 90000, 'game HTML must stay conservative for WhatsApp primitive payloads')
  assert.ok(!/<script\s+[^>]*src=/i.test(html), 'games cannot depend on external scripts')
  assert.ok(!/<link\s+[^>]*href=/i.test(html), 'games cannot depend on external stylesheets')
  assert.ok(!/\bfetch\s*\(/i.test(html), 'games must work without network access')
  assert.match(html, /touch-action\s*:\s*none/i, 'game controls must own touch gestures')
  assert.match(html, /pointerdown/i, 'games need pointer/touch controls')
}

const transport = readFileSync('apps/bot/src/services/ai-html.ts', 'utf8')
for (const marker of ['protectGameHtmlInput', 'contextmenu', 'selectstart', 'dragstart', 'touchstart', 'touchmove']) {
  assert.ok(transport.includes(marker), `global game input guard missing ${marker}`)
}
assert.ok(transport.includes('payload: protectGameHtmlInput(html)'), 'all HTML games must inherit the input guard')

console.log(`[arcade-v16] OK · ${expected.join(', ')} · offline HTML · long-press guard`)
