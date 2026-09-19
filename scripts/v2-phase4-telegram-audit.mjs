#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  client: 'apps/bot/src/platform/telegram/client.ts',
  adapter: 'apps/bot/src/platform/telegram/adapter.ts',
  runtime: 'apps/bot/src/platform/telegram/runtime.ts',
  bridge: 'apps/bot/src/services/telegram-bridge-v7.ts',
  router: 'apps/bot/src/platform/telegram/router.ts',
  providers: 'apps/bot/src/commands/download-providers-v3.ts',
  shared: 'apps/bot/src/commands/shared.ts',
}
const source = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, 'utf8')])))

assert.match(source.client, /getUpdates\(offset:/)
assert.match(source.runtime, /client!\.getUpdates\(/)
assert.doesNotMatch(source.bridge, /\.getUpdates\(/, 'legacy bridge must never consume updates after Phase 4')
assert.match(source.runtime, /update\.channel_post/)
assert.match(source.runtime, /update\.callback_query/)
assert.match(source.runtime, /Math\.max\(this\.offset, Number\(update\.update_id\) \+ 1\)/)
assert.match(source.runtime, /getWebhookInfo\(\)/)
assert.match(source.runtime, /deleteWebhook\(/)
assert.match(source.runtime, /blocked-webhook/)
assert.match(source.adapter, /CALLBACK_LIMIT_BYTES = 64/)
assert.match(source.adapter, /TELEGRAM_TEXT_LIMIT = 4096/)
assert.match(source.router, /CommandEngine/)
assert.match(source.router, /sharedNeutralCommands/)
assert.match(source.providers, /downloadVkVideo/)
assert.match(source.providers, /searchApkMirror/)
assert.match(source.providers, /searchApkPure/)
assert.match(source.providers, /downloadPhase3Apk/)
assert.doesNotMatch(source.router, /downloadVkVideo|searchApkMirror|searchApkPure|downloadPhase3Apk/, 'Telegram router must not duplicate shared provider commands')
assert.match(source.bridge, /ingestTelegramChannelPost/)

const botApiReferences = Object.entries(source).filter(([, text]) => text.includes('api.telegram.org'))
assert.deepEqual(botApiReferences.map(([key]) => key), ['client'], 'Bot API URL construction must stay inside Telegram client boundary')

const packageJson = JSON.parse(await readFile('apps/bot/package.json', 'utf8'))
const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }
for (const name of Object.keys(dependencies)) {
  assert.ok(!/telegraf|node-telegram-bot-api|grammy/i.test(name), `unexpected Telegram SDK dependency: ${name}`)
}

const index = await readFile('apps/bot/src/index.ts', 'utf8')
assert.match(index, /startTelegramBridge\(\)/, 'legacy startup hook must remain for update compatibility')
assert.match(source.bridge, /startTelegramPlatform/, 'legacy startup hook must delegate to native runtime')

console.log('[V2 PHASE 4 AUDIT] OK — one getUpdates consumer, isolated Bot API boundary, webhook guard and shared providers verified.')
