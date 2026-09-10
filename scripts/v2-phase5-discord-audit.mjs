#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const source = async (file) => readFile(path.join(root, file), 'utf8')

const files = {
  types: await source('apps/bot/src/platform/discord/types.ts'),
  config: await source('apps/bot/src/platform/discord/config.ts'),
  rest: await source('apps/bot/src/platform/discord/rest.ts'),
  normalize: await source('apps/bot/src/platform/discord/normalize.ts'),
  adapter: await source('apps/bot/src/platform/discord/adapter.ts'),
  gateway: await source('apps/bot/src/platform/discord/gateway.ts'),
  router: await source('apps/bot/src/platform/discord/router.ts'),
  runtime: await source('apps/bot/src/platform/discord/runtime.ts'),
  index: await source('apps/bot/src/index.ts'),
  env: await source('.env.example'),
  contracts: await source('packages/platform-contracts/src/index.ts'),
}

for (const [name, content] of Object.entries(files)) {
  if (['index', 'contracts', 'env'].includes(name)) continue
  assert.equal(/from ['"]baileys['"]/.test(content), false, `Discord ${name} must not depend on Baileys`)
  assert.equal(content.includes('TELEGRAM_BOT_TOKEN'), false, `Discord ${name} must not consume Telegram credentials`)
}

assert.ok(files.contracts.includes("'discord'"), 'platform contracts must include Discord')
assert.ok(files.adapter.includes("readonly id = 'discord'"))
assert.ok(files.normalize.includes("platform: 'discord'"))
assert.ok(files.adapter.includes('DISCORD_TEXT_LIMIT = 2000'))
assert.ok(files.adapter.includes('MAX_UPLOAD_BYTES = 24 * 1024 * 1024'))
assert.ok(files.adapter.includes("allowed_mentions: { parse: [], replied_user: false }"), 'Discord output must suppress accidental mentions')
assert.ok(files.adapter.includes('DISCORD_CUSTOM_ID_LIMIT = 100'))

const restApiMatches = Object.entries(files)
  .filter(([name]) => !['rest', 'env'].includes(name))
  .filter(([, content]) => content.includes('discord.com/api/v10'))
assert.deepEqual(restApiMatches, [], 'Discord REST API origin must stay inside rest.ts')
assert.ok(files.rest.includes("const API_ORIGIN = 'https://discord.com/api/v10'"))
assert.ok(files.rest.includes("response.status === 429"))
assert.ok(files.rest.includes('retry_after'))
assert.ok(files.rest.includes("authenticated: false"), 'interaction callbacks must support unauthenticated webhook-style requests')

assert.ok(files.gateway.includes("url.searchParams.set('v', '10')"))
assert.ok(files.gateway.includes('op: 2'), 'Gateway must implement IDENTIFY')
assert.ok(files.gateway.includes('op: 6'), 'Gateway must implement RESUME')
assert.ok(files.gateway.includes('payload.op === 10'), 'Gateway must handle Hello')
assert.ok(files.gateway.includes('payload.op === 11'), 'Gateway must handle heartbeat ACK')
assert.ok(files.gateway.includes('FATAL_CLOSE_CODES'))
assert.ok(files.gateway.includes('4014'))
assert.ok(files.gateway.includes('session_start_limit.remaining'))

assert.ok(files.config.includes('DISCORD_MESSAGE_CONTENT_ENABLED'))
assert.ok(files.config.includes('messageContentEnabled = enabled(process.env.DISCORD_MESSAGE_CONTENT_ENABLED, false)'), 'MESSAGE_CONTENT must default off')
assert.ok(files.config.includes('DISCORD_OWNER_IDS'))
assert.ok(files.config.includes('DISCORD_STAFF_IDS'))
assert.ok(files.config.includes('DISCORD_GUILD_ID'))
assert.ok(files.config.includes('messageContent: 1 << 15'))

assert.ok(files.router.includes("downloadVkVideo"))
assert.ok(files.router.includes('searchApkMirror'))
assert.ok(files.router.includes('searchApkPure'))
assert.ok(files.router.includes("name: 'ping'"))
assert.ok(files.router.includes("name: 'vk'"))
assert.ok(files.router.includes("name: 'apkmirror'"))
assert.ok(files.router.includes("name: 'apkpure'"))
assert.ok(files.router.includes('discordStaff'))
assert.ok(files.router.includes('discordOwner'))

assert.ok(files.runtime.includes('interactionCallback(interaction.id, interaction.token, callbackType)'))
assert.ok(files.runtime.includes('overwriteApplicationCommands'))
assert.ok(files.runtime.includes('persistSession'))
assert.ok(files.index.includes("startDiscordPlatform"), 'main process must start Discord native runtime')
assert.ok(files.index.includes("discordRuntimeStatus"), 'health endpoint must expose Discord state')

for (const variable of [
  'DISCORD_BOT_TOKEN=',
  'DISCORD_OWNER_IDS=',
  'DISCORD_STAFF_IDS=',
  'DISCORD_GUILD_ID=',
  'DISCORD_REGISTER_COMMANDS=true',
  'DISCORD_MESSAGE_CONTENT_ENABLED=false',
  'DISCORD_PLATFORM_STATE_FILE=',
]) assert.ok(files.env.includes(variable), `.env.example missing ${variable}`)

console.log('[V2 PHASE 5] OK — Discord remains isolated from Baileys/Telegram, REST/Gateway boundaries are explicit, MESSAGE_CONTENT is opt-in and main runtime starts the platform.')
