#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const metadata = read('apps/bot/src/services/command-metadata.ts')
const discord = read('apps/bot/src/platform/discord/router.ts')
const telegram = read('apps/bot/src/platform/telegram/router.ts')
const componentStore = read('apps/bot/src/platform/discord/component-store.ts')
const adapter = read('apps/bot/src/platform/discord/adapter.ts')
const rest = read('apps/bot/src/platform/discord/rest.ts')
const media = read('apps/bot/src/services/outgoing-media-stream.ts')
const roadmap = read('README_NEXT_INTEGRATIONS.md')

assert.match(metadata, /resolvePlatformCommandToken/, 'C2 central token resolver missing')
assert.match(metadata, /platformCommandHelpCatalog/, 'C3 central help catalog missing')
assert.doesNotMatch(discord, /command-platform-support/, 'C2 Discord router still consumes compatibility alias map')
assert.doesNotMatch(telegram, /command-platform-support/, 'C2 Telegram router still consumes compatibility alias map')
assert.match(discord, /resolvePlatformCommandToken\('discord'/, 'C2 Discord parser not using central resolver')
assert.match(telegram, /resolvePlatformCommandToken\('telegram'/, 'C2 Telegram parser not using central resolver')
assert.match(discord, /platformCommandHelpCatalog\('discord'/, 'C3 Discord help not generated from central metadata')
assert.match(telegram, /platformCommandHelpCatalog\('telegram'/, 'C3 Telegram help not generated from central metadata')

assert.match(componentStore, /CREATE TABLE IF NOT EXISTS discord_component_refs/, 'C4 persistent component table missing')
assert.match(componentStore, /PRIMARY KEY\(scope, token\)/, 'C4 component scope isolation missing')
assert.match(adapter, /persistDiscordComponentRef/, 'C4 adapter does not persist long component IDs')
assert.match(adapter, /resolveDiscordComponentRef/, 'C4 adapter does not restore component IDs')

assert.match(media, /createReadStream/, 'C5 path media is not streamed')
assert.match(media, /AsyncIterable<Uint8Array>/, 'C5 shared streaming contract missing')
assert.match(adapter, /createMessageWithFileStream/, 'C5 Discord adapter is not using streaming upload')
assert.doesNotMatch(adapter, /arrayBuffer\(\)/, 'C5 Discord adapter still buffers remote media')

assert.match(rest, /x-ratelimit-bucket/, 'C6 bucket header support missing')
assert.match(rest, /x-ratelimit-reset-after/, 'C6 reset-after support missing')
assert.match(rest, /majorParameter/, 'C6 major parameter isolation missing')
assert.match(rest, /routeBuckets/, 'C6 route-to-bucket mapping missing')
assert.match(rest, /globalRateLimitUntil/, 'C6 global limit fallback missing')

for (const phase of ['C2', 'C3', 'C4', 'C5', 'C6']) {
  assert.match(roadmap, new RegExp(`## ${phase}\\.[\\s\\S]*?Estado: TERMINADO`), `${phase} roadmap status is not TERMINADO`)
}
assert.match(roadmap, /Fase C \| Paridad Discord y Telegram \| TERMINADO/, 'Phase C summary is not TERMINADO')

console.log('Phase C2-C6 parity smoke passed')
