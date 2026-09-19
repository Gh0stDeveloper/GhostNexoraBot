import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-e5-'))
process.env.DATA_DIR = temp
process.env.NEXORA_INSTANCE_ROLE = 'main'
delete process.env.NEXORA_SUBBOT_ID

try {
  const support = await import('../apps/bot/dist/services/command-platform-support.js')
  const audit = await import('../apps/bot/dist/services/performance-audit.js')

  assert.equal(support.discordCommandAliases.get('menu'), 'help', 'Discord parity catalog must reflect the live native router')
  assert.equal(support.telegramCommandAliases.get('menu'), 'help', 'Telegram parity catalog must reflect the live native router')

  const ping = { name: 'ping', aliases: [], category: 'tools', description: 'Ping' }
  const whatsappOnly = { name: 'e5only', aliases: [], category: 'tools', description: 'WhatsApp only' }
  const aliasBacked = { name: 'languageci', aliases: ['language'], category: 'general', description: 'Alias-backed parity' }

  assert.deepEqual(support.commandPlatformSupport(ping), { whatsapp: true, discord: true, telegram: true })
  assert.deepEqual(support.commandPlatformSupport(whatsappOnly), { whatsapp: true, discord: false, telegram: false })
  assert.deepEqual(support.commandPlatformSupport(aliasBacked), { whatsapp: true, discord: true, telegram: true })

  audit.performanceAudit.registerCommands([ping, whatsappOnly, aliasBacked], 'main')
  audit.performanceAudit.recordCommand(ping, 20, true, 0, 'main')
  audit.performanceAudit.recordRuntimeCommand('ping', 30, true, 'main', { userJid: 'discord:e5', displayName: 'Discord E5' })
  audit.performanceAudit.recordRuntimeCommand('ping', 40, false, 'main', { userJid: 'telegram:e5', displayName: 'Telegram E5' })

  const snapshot = audit.performanceAudit.snapshot('main')
  const pingRow = snapshot.commands.find((row) => row.commandName === 'ping')
  const onlyRow = snapshot.commands.find((row) => row.commandName === 'e5only')
  const aliasRow = snapshot.commands.find((row) => row.commandName === 'languageci')
  assert.ok(pingRow)
  assert.equal(pingRow.whatsapp, true)
  assert.equal(pingRow.discord, true)
  assert.equal(pingRow.telegram, true)
  assert.equal(pingRow.invocations, 3, 'E5 metrics must aggregate native platform executions into the command row')
  assert.equal(pingRow.successes, 2)
  assert.equal(pingRow.failures, 1)
  assert.ok(pingRow.avgUs > 0)
  assert.ok(onlyRow)
  assert.equal(onlyRow.whatsapp, true)
  assert.equal(onlyRow.discord, false)
  assert.equal(onlyRow.telegram, false)
  assert.ok(aliasRow)
  assert.equal(aliasRow.discord, true)
  assert.equal(aliasRow.telegram, true)

  audit.performanceAudit.registerCommands([whatsappOnly], 'subbot:55')
  const subbotSnapshot = audit.performanceAudit.snapshot('subbot:55')
  assert.equal(subbotSnapshot.commands.length, 1)
  assert.equal(subbotSnapshot.commands[0]?.commandName, 'e5only')
  assert.equal(subbotSnapshot.commands.some((row) => row.commandName === 'ping'), false, 'Subbot command telemetry must remain isolated')

  const [
    roadmap,
    serviceSource,
    discordSource,
    telegramSource,
    webOpsSource,
    centerSource,
    adminSource,
    subbotSource,
    navSource,
    i18nSource,
  ] = await Promise.all([
    readFile(new URL('../README_NEXT_INTEGRATIONS.md', import.meta.url), 'utf8'),
    readFile(new URL('../apps/bot/src/services/command-platform-support.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/bot/src/platform/discord/router.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/bot/src/platform/telegram/router.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/lib/ops.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/components/command-center.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/app/admin/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/app/subbot/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/components/unified-navigation.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/lib/i18n.ts', import.meta.url), 'utf8'),
  ])

  assert.match(roadmap, /## E5\. Centro de comandos[\s\S]*Estado: TERMINADO/, 'E5 roadmap must be completed')
  assert.match(serviceSource, /DISCORD_COMMAND_ALIAS_ENTRIES/, 'Discord support catalog missing')
  assert.match(serviceSource, /TELEGRAM_COMMAND_ALIAS_ENTRIES/, 'Telegram support catalog missing')
  assert.match(discordSource, /discordCommandAliases/, 'Discord router must consume the shared parity catalog')
  assert.match(telegramSource, /telegramCommandAliases/, 'Telegram router must consume the shared parity catalog')
  assert.match(discordSource, /recordRuntimeCommand/, 'Discord command executions must feed E5 metrics')
  assert.match(telegramSource, /recordRuntimeCommand/, 'Telegram command executions must feed E5 metrics')

  assert.match(webOpsSource, /whatsapp: boolean/, 'Web command model must expose WhatsApp support')
  assert.match(webOpsSource, /discord: boolean/, 'Web command model must expose Discord support')
  assert.match(webOpsSource, /telegram: boolean/, 'Web command model must expose Telegram support')
  assert.match(webOpsSource, /PRAGMA table_info\(ops_command_catalog\)/, 'Web snapshot must tolerate a pre-E5 command catalog')
  assert.match(webOpsSource, /whatsappColumn/, 'Legacy-safe WhatsApp parity fallback missing')

  assert.match(centerSource, /export function CommandCenter/, 'Dedicated command center component missing')
  assert.match(centerSource, /command\.whatsapp/, 'WhatsApp parity column missing')
  assert.match(centerSource, /command\.discord/, 'Discord parity column missing')
  assert.match(centerSource, /command\.telegram/, 'Telegram parity column missing')
  assert.match(centerSource, /command\.invocations/, 'Invocation column missing')
  assert.match(centerSource, /command\.successRate/, 'Success-rate column missing')
  assert.match(centerSource, /command\.avgUs/, 'Average-latency column missing')
  assert.match(centerSource, /command\.status/, 'Status column missing')
  assert.match(centerSource, /parity === 'missing'/, 'Missing-parity filter must be available')
  assert.match(centerSource, /fullParity/, 'Full parity summary must be computed')

  assert.match(adminSource, /\['commands', t\('nav\.commands'\), SquareTerminal/, 'Admin command navigation missing')
  assert.match(adminSource, /<CommandCenter commands=\{snapshot\.commands\}/, 'Admin command center missing')
  assert.match(subbotSource, /\['commands', t\('nav\.commands'\), SquareTerminal/, 'Subbot command navigation missing')
  assert.match(subbotSource, /<CommandCenter commands=\{snapshot\.commands\}/, 'Subbot isolated command center missing')
  assert.match(navSource, /\| 'commands'/, 'Unified navigation command icon missing')
  assert.match(i18nSource, /'commands\.title': 'Centro de comandos'/, 'Spanish E5 copy missing')
  assert.match(i18nSource, /'commands\.title': 'Command Center'/, 'English E5 copy missing')

  console.log('Phase E5 command center smoke passed')
} finally {
  await rm(temp, { recursive: true, force: true })
}
