#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => readFileSync(path.join(root, file), 'utf8')

const types = read('apps/bot/src/types.ts')
const legacy = read('apps/bot/src/core/legacy-whatsapp-command-context.ts')
const router = read('apps/bot/src/core/router.ts')
const general = read('apps/bot/src/commands/general.ts')
const credits = read('apps/bot/src/commands/credits.ts')
const system = read('apps/bot/src/commands/system.ts')
const roadmap = read('README_NEXT_INTEGRATIONS.md')

assert.doesNotMatch(types, /from ['"]baileys['"]/, 'B1 neutral types.ts must not import Baileys')
const commandContext = /export interface CommandContext \{([\s\S]*?)\n\}/.exec(types)?.[1] ?? ''
assert.ok(commandContext, 'CommandContext interface missing')
assert.doesNotMatch(commandContext, /^\s*socket\s*:/m, 'CommandContext must not expose socket')
assert.doesNotMatch(commandContext, /^\s*message\s*:/m, 'CommandContext must not expose raw message')
for (const helper of ['sendText', 'sendMedia', 'sendUi', 'setTyping', 'editMessage']) {
  assert.match(commandContext, new RegExp(`\\b${helper}\\b`), `B1 neutral helper missing: ${helper}`)
}

assert.match(types, /export type LegacyCompatibleCommandContext = CommandContext & LegacyWhatsAppCommandContext/, 'B1 compatibility type missing')
assert.match(types, /export interface NeutralBotCommand/, 'B1 neutral command type missing')
assert.match(legacy, /from 'baileys'/, 'Baileys compatibility must be isolated in the legacy bridge')
assert.match(legacy, /socket: NexoraSocket/, 'legacy WhatsApp socket bridge missing')
assert.match(legacy, /message: WAMessage/, 'legacy WhatsApp message bridge missing')

assert.match(router, /const sendText: LegacyCompatibleCommandContext\['sendText'\]/, 'router sendText binding missing')
assert.match(router, /const sendMedia: LegacyCompatibleCommandContext\['sendMedia'\]/, 'router sendMedia binding missing')
assert.match(router, /const sendUi: LegacyCompatibleCommandContext\['sendUi'\]/, 'router sendUi binding missing')
assert.match(router, /const setTyping: LegacyCompatibleCommandContext\['setTyping'\]/, 'router setTyping binding missing')
assert.match(router, /const editMessage: LegacyCompatibleCommandContext\['editMessage'\]/, 'router editMessage binding missing')
assert.match(router, /normalizedMessage\.messageId/, 'neutral reply/reaction must use normalized message id')

const certifiedNeutralModules = [
  ['general', general],
  ['credits', credits],
  ['system', system],
  ['balance-v10', read('apps/bot/src/commands/balance-v10.ts')],
  ['banking-v10', read('apps/bot/src/commands/banking-v10.ts')],
  ['developer-v8', read('apps/bot/src/commands/developer-v8.ts')],
  ['minershop-v10', read('apps/bot/src/commands/minershop-v10.ts')],
  ['casino-guard-v4', read('apps/bot/src/commands/casino-guard-v4.ts')],
  ['group-controls-v9', read('apps/bot/src/commands/group-controls-v9.ts')],
  ['economy-careers-v8', read('apps/bot/src/commands/economy-careers-v8.ts')],
  ['adult-roleplay-messages-v14', read('apps/bot/src/commands/adult-roleplay-messages-v14.ts')],
]

for (const [name, source] of certifiedNeutralModules) {
  assert.match(source, /NeutralBotCommand/, `${name} batch must be typed as NeutralBotCommand`)
  assert.doesNotMatch(source, /ctx\.socket\b/, `${name} must not use ctx.socket after B1 migration`)
  assert.doesNotMatch(source, /ctx\.message\b/, `${name} must not use ctx.message after B1 migration`)
  assert.doesNotMatch(source, /from ['"]baileys['"]/, `${name} must not import Baileys`)
}

assert.match(general, /ctx\.sendUi\(/, 'menu must use neutral sendUi')
assert.match(general, /ctx\.sendMedia\(/, 'info must use neutral sendMedia')
assert.match(general, /ctx\.setTyping\(/, 'ping must use neutral setTyping')


const commandDir = path.join(root, 'apps/bot/src/commands')
for (const file of readdirSync(commandDir).filter((name) => name.endsWith('.ts'))) {
  const source = read(path.join('apps/bot/src/commands', file))
  const usesLegacySurface =
    /ctx\.(?:socket|message)\b/.test(source) ||
    /from ['"]baileys['"]/.test(source)
  if (!usesLegacySurface) continue

  const importedContextNames = [...source.matchAll(/import type\s*\{([\s\S]*?)\}\s*from\s*['"]\.\.\/types\.js['"]/g)]
    .flatMap((match) => match[1].split(',').map((name) => name.trim()))
  assert.ok(
    !importedContextNames.includes('CommandContext'),
    `${file} uses the legacy WhatsApp/Baileys surface but imports neutral CommandContext`,
  )
  assert.doesNotMatch(
    source,
    /\bctx\s*:\s*CommandContext\b/,
    `${file} uses the legacy WhatsApp/Baileys surface with a neutral ctx annotation`,
  )
}

assert.match(
  roadmap,
  /## B1\. Eliminar dependencia progresiva de Baileys en CommandContext[\s\S]*Estado: (?:EN PROGRESO|TERMINADO)/,
  'B1 roadmap status missing',
)

console.log('Phase B1 neutral CommandContext smoke passed')
