#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (file) => readFileSync(file, 'utf8')

const engine = read('apps/bot/src/core/shared-command-engine.ts')
const shared = read('apps/bot/src/commands/shared-neutral.ts')
const whatsapp = read('apps/bot/src/core/router.ts')
const discord = read('apps/bot/src/platform/discord/router.ts')
const telegram = read('apps/bot/src/platform/telegram/router.ts')
const support = read('apps/bot/src/services/command-platform-support.ts')
const metadata = read('apps/bot/src/services/command-metadata.ts')
const roadmap = read('README_NEXT_INTEGRATIONS.md')

assert.match(engine, /export class SharedCommandEngine/, 'B2 shared command engine missing')
assert.match(engine, /createNeutralCommandContext/, 'B2 neutral context factory missing')
for (const helper of ['sendText', 'sendMedia', 'sendUi', 'setTyping', 'editMessage', 'reply', 'react']) {
  assert.match(engine, new RegExp(`\\b${helper}\\b`), `B2 neutral transport helper missing: ${helper}`)
}
assert.match(engine, /allowLegacy/, 'B2 engine must preserve an explicit legacy compatibility boundary')
assert.match(engine, /enforceMetadata/, 'B2 engine metadata policy gate missing')

assert.match(shared, /sharedNeutralCommands/, 'B2 shared neutral catalog missing')
assert.match(shared, /generalCommands/, 'B2 common command catalog must include general commands')
assert.match(shared, /creditsCommands/, 'B2 common command catalog must include credits')
assert.match(shared, /command\.name !== 'menu'/, 'B2 must keep help/menu native until metadata parity exists')

assert.match(whatsapp, /new SharedCommandEngine\(commands, sharedNeutralCommands\)/, 'WhatsApp must resolve commands through the B2 engine')
assert.match(whatsapp, /this\.engine\.resolve\(typedName\)/, 'WhatsApp lookup must use the B2 engine')
assert.match(
  whatsapp,
  /this\.engine\.execute\(command, context, \{\s*allowLegacy: true,\s*enforceMetadata: false,\s*isGroupAdmin: requestContext\.permissions\.isGroupAdmin,\s*botIsGroupAdmin: requestContext\.permissions\.isBotGroupAdmin,\s*\}\)/,
  'WhatsApp execution must pass through the B2 engine while preserving V1 compatibility',
)

assert.match(discord, /sharedCommandEngine = new SharedCommandEngine\(sharedNeutralCommands, sharedNeutralCommands\)/, 'Discord shared engine missing')
assert.match(discord, /createNeutralCommandContext\(/, 'Discord must build the shared neutral context')
assert.match(discord, /sharedCommandEngine\.execute\(sharedCommand, context, \{ enforceMetadata: true \}\)/, 'Discord neutral commands must execute through B2 engine')
assert.match(discord, /aliases\.get\(name\) \?\? sharedCommandEngine\.resolve\(name\)\?\.name/, 'Discord parser must accept shared command aliases')

assert.match(telegram, /sharedCommandEngine = new SharedCommandEngine\(sharedNeutralCommands, sharedNeutralCommands\)/, 'Telegram shared engine missing')
assert.match(telegram, /createNeutralCommandContext\(/, 'Telegram must build the shared neutral context')
assert.match(telegram, /sharedCommandEngine\.execute\(sharedCommand, context, \{ enforceMetadata: true \}\)/, 'Telegram neutral commands must execute through B2 engine')
assert.match(telegram, /aliases\.get\(rawName\.toLowerCase\(\)\) \?\? sharedCommandEngine\.resolve\(rawName\)\?\.name/, 'Telegram parser must accept shared command aliases')

assert.match(support, /command-metadata\.js/, 'command parity support must project the central metadata registry')
assert.match(metadata, /sharedNeutralCommands/, 'B3 metadata must preserve B2 shared command parity')
assert.match(roadmap, /## B2\. Un solo Command Engine[\s\S]*Estado: (?:EN PROGRESO|TERMINADO)/, 'B2 roadmap status missing')

console.log('Phase B2 shared Command Engine smoke passed')
