#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (file) => readFileSync(file, 'utf8')

const types = read('apps/bot/src/types.ts')
const metadata = read('apps/bot/src/services/command-metadata.ts')
const support = read('apps/bot/src/services/command-platform-support.ts')
const menuRegistry = read('apps/bot/src/services/menu-registry.ts')
const menu = read('apps/bot/src/commands/menu-v5.ts')
const search = read('apps/bot/src/commands/command-search.ts')
const discord = read('apps/bot/src/platform/discord/router.ts')
const telegram = read('apps/bot/src/platform/telegram/router.ts')
const audit = read('apps/bot/src/services/performance-audit.ts')
const webOps = read('apps/web/lib/ops.ts')
const webCenter = read('apps/web/components/command-center.tsx')
const roadmap = read('README_NEXT_INTEGRATIONS.md')

for (const field of ['platforms?: PlatformId[]', 'arguments?: CommandArgumentMetadata[]', 'requiresCapabilities?: CapabilityName[]']) {
  assert.ok(types.includes(field), `B3 BotCommand field missing: ${field}`)
}

for (const symbol of [
  'export type CommandMetadata',
  'buildCommandMetadata',
  'commandMetadataCatalog',
  'commandPlatformSupport',
  'platformCommandMetadata',
  'commandMetadataForPlatformToken',
  'commandMetadataVisibleTo',
  'discordSlashCommandTokens',
]) {
  assert.ok(metadata.includes(symbol), `B3 central metadata symbol missing: ${symbol}`)
}
for (const field of ['aliases:', 'category:', 'description:', 'arguments:', 'permissions:', 'platforms:', 'requiredCapabilities:']) {
  assert.ok(metadata.includes(field), `B3 metadata field missing: ${field}`)
}

assert.match(support, /from '.\/command-metadata\.js'/, 'Platform support must be a B3 metadata projection')
assert.match(menuRegistry, /effectiveCommandMetadata/, 'Menu registry must expose normalized B3 metadata')
assert.match(menu, /effectiveCommandMetadata\(\)/, 'WhatsApp menu must consume B3 metadata')
assert.match(search, /effectiveCommandMetadata\(\)/, 'Command search/help must consume B3 metadata')

assert.match(discord, /discordSlashCommandTokens\(\)/, 'Discord slash definitions must be sourced from B3 metadata')
assert.match(discord, /commandMetadataForPlatformToken\('discord'/, 'Discord slash metadata lookup missing')
assert.match(discord, /platformCommandMetadata\('discord'\)/, 'Discord help must be generated from B3 metadata')
assert.match(telegram, /platformCommandMetadata\('telegram'\)/, 'Telegram help must be generated from B3 metadata')

for (const column of ['aliases_json', 'usage', 'arguments_json', 'permissions_json', 'capabilities_json']) {
  assert.ok(audit.includes(column), `Operations command catalog does not persist B3 field: ${column}`)
}
for (const field of ['aliases:', 'usage:', 'arguments:', 'permissions:', 'capabilities:']) {
  assert.ok(webOps.includes(field), `Web Operations type missing B3 field: ${field}`)
}
assert.match(webCenter, /selected\.aliases/, 'Operations Center must display command aliases from B3 metadata')
assert.match(webCenter, /selected\.arguments/, 'Operations Center must display command arguments from B3 metadata')
assert.match(webCenter, /selected\.capabilities/, 'Operations Center must display command capabilities from B3 metadata')

assert.match(roadmap, /## B3\. Metadata central de comandos[\s\S]*Estado: (?:EN PROGRESO|TERMINADO)/, 'B3 roadmap status missing')

console.log('Phase B3 central command metadata smoke passed')
