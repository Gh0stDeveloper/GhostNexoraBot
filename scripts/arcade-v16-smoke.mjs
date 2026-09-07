#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const v16Expected = ['pacman', 'buscaminas', 'halo', 'pianotiles', 'bounce']
const v17Expected = ['flappy', 'breakout', 'pong', '2048', 'asteroids', 'memoria']
const { commands } = await import('../apps/bot/dist/commands/index.js')
for (const name of [...v16Expected, ...v17Expected]) {
  const matches = commands.filter((command) => command.name === name)
  assert.equal(matches.length, 1, `${name} must be registered exactly once`)
  assert.equal(matches[0].category, 'games', `${name} must be in games category`)
}

const arcade16 = await import('../apps/bot/dist/services/arcade-games-v16.js')
const arcade17 = await import('../apps/bot/dist/services/arcade-games-v17.js')
const builders = [
  arcade16.buildPacmanGameHtml,
  arcade16.buildMinesweeperGameHtml,
  arcade16.buildHaloArenaGameHtml,
  arcade16.buildPianoTilesGameHtml,
  arcade16.buildBounceGameHtml,
  arcade17.buildFlappyGameHtml,
  arcade17.buildBreakoutGameHtml,
  arcade17.buildPongGameHtml,
  arcade17.build2048GameHtml,
  arcade17.buildAsteroidsGameHtml,
  arcade17.buildMemoryGameHtml,
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

const updateCommand = commands.find((command) => command.name === 'actualizar')
assert.ok(updateCommand, '.actualizar must be registered')
assert.equal(updateCommand.ownerOnly, true, '.actualizar must remain owner-only')
assert.equal(updateCommand.category, 'owner', '.actualizar must remain an owner command')
const systemSource = readFileSync('apps/bot/src/commands/system.ts', 'utf8')
assert.ok(systemSource.includes("path.join(config.dataDir, 'update-request')"), 'update command must only create the fixed request file')
assert.ok(!systemSource.includes("exec("), 'update command must not execute arbitrary shell commands')
const installer = readFileSync('scripts/install-cli.mjs', 'utf8')
assert.ok(installer.includes('ghost-nexora-update.path'), 'installer must configure the root update trigger')
assert.ok(installer.includes('PathExists='), 'update trigger must watch a fixed request file')
const runner = readFileSync('scripts/update-request-runner.sh', 'utf8')
assert.ok(runner.includes('scripts/update.sh'), 'privileged runner must execute only update.sh')
assert.ok(runner.includes('flock -n'), 'privileged runner must prevent concurrent updates')
const shellSyntax = spawnSync('bash', ['-n', 'scripts/update-request-runner.sh'])
assert.equal(shellSyntax.status, 0, 'update request runner must have valid shell syntax')

console.log(`[arcade] OK · V16 ${v16Expected.length} + V17 ${v17Expected.length} games · offline HTML · long-press guard · secure .actualizar`)
