#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const source = (file) => readFile(path.join(root, file), 'utf8')
const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-b2-'))

process.env.DATA_DIR = temp
process.env.NEXORA_INSTANCE_ROLE = 'main'
delete process.env.NEXORA_SUBBOT_ID
delete process.env.NEXORA_GLOBAL_CONTROL_DB

try {
  const [
    engineSource,
    routerSource,
    discordSource,
    telegramSource,
    sharedSource,
    generalSource,
    languageSource,
    providersSource,
    versionSource,
    typesSource,
    roadmap,
  ] = await Promise.all([
    source('apps/bot/src/core/command-engine.ts'),
    source('apps/bot/src/core/router.ts'),
    source('apps/bot/src/platform/discord/router.ts'),
    source('apps/bot/src/platform/telegram/router.ts'),
    source('apps/bot/src/commands/shared.ts'),
    source('apps/bot/src/commands/general.ts'),
    source('apps/bot/src/commands/language.ts'),
    source('apps/bot/src/commands/download-providers-v3.ts'),
    source('apps/bot/src/commands/version-v8.ts'),
    source('apps/bot/src/types.ts'),
    source('README_NEXT_INTEGRATIONS.md'),
  ])

  assert.match(engineSource, /export class CommandEngine/, 'B2 shared CommandEngine missing')
  assert.match(engineSource, /commandRuntimeDecision/, 'B2 engine must centralize runtime policy')
  assert.match(engineSource, /markCommandCooldown/, 'B2 engine must centralize cooldown writes')
  assert.match(engineSource, /command\.handler\(ctx\)/, 'B2 engine must own command handler execution')
  assert.match(engineSource, /performanceAudit\.recordCommand/, 'B2 engine must centralize command audit')

  assert.match(routerSource, /new CommandEngine<LegacyCompatibleCommandContext>/, 'WhatsApp must instantiate the shared engine')
  assert.match(routerSource, /this\.engine\.resolve\(typedName\)/, 'WhatsApp matcher must use CommandEngine')
  assert.match(routerSource, /this\.engine\.execute\(command, context/, 'WhatsApp execution must use CommandEngine')

  for (const [label, platformSource] of [['Discord', discordSource], ['Telegram', telegramSource]]) {
    assert.match(platformSource, /new CommandEngine<CommandContext>\(sharedNeutralCommands\)/, `${label} must use the shared neutral catalog`)
    assert.match(platformSource, /this\.engine\.resolve/, `${label} must resolve through CommandEngine`)
    assert.match(platformSource, /this\.engine\.execute/, `${label} must execute through CommandEngine`)
    assert.doesNotMatch(platformSource, /downloadVkVideo|searchApkMirror|searchApkPure|providerHealthSnapshot/, `${label} router must not duplicate shared provider handlers`)
    assert.doesNotMatch(platformSource, /private async (?:help|language|store|storeDownload|vk)\b/, `${label} router still contains a duplicated shared handler`)
  }

  assert.match(discordSource, /if \(clean\.startsWith\('\/'\)\) clean = clean\.slice\(1\)/, 'Discord component commands must normalize slash-prefixed shared actions')
  assert.match(telegramSource, /\.replace\(\/\^\\\/\+\//, 'Telegram callback parsing must normalize repeated slash prefixes')

  for (const name of ['generalCommands', 'languageCommands', 'creditsCommands', 'systemCommands', 'versionV8Commands', 'downloadProvidersV3Commands']) {
    assert.match(sharedSource, new RegExp(`\\.\\.${name}`), `shared catalog missing ${name}`)
  }

  assert.match(languageSource, /NeutralBotCommand/, 'language must be transport-neutral in B2')
  assert.match(languageSource, /platform: ctx\.platform/, 'language preferences must use the active platform')
  assert.doesNotMatch(languageSource, /ctx\.(?:socket|message)\b|from ['"]baileys['"]/, 'language must not depend on Baileys')

  assert.match(providersSource, /NeutralBotCommand/, 'provider parity commands must be neutral in B2')
  assert.match(providersSource, /ctx\.sendUi\(/, 'provider search must use neutral UI')
  assert.match(providersSource, /ctx\.sendMedia\(/, 'provider downloads must use neutral media')
  assert.doesNotMatch(providersSource, /ctx\.(?:socket|message)\b|from ['"]baileys['"]/, 'provider parity commands must not depend on Baileys')

  assert.match(versionSource, /NeutralBotCommand/, 'version command must be neutral')
  assert.match(versionSource, /ctx\.platform\.toUpperCase/, 'version must report the active platform')
  assert.match(generalSource, /ctx\.platform !== 'whatsapp'/, 'shared menu must adapt to non-WhatsApp platforms')
  assert.match(generalSource, /commandPlatformSupport/, 'shared menu must only expose supported commands')
  assert.match(generalSource, /commandRuntimeDecision/, 'shared menu must respect runtime command visibility')

  assert.match(typesSource, /sendText:/, 'neutral sendText helper missing')
  assert.match(typesSource, /sendMedia:/, 'neutral sendMedia helper missing')
  assert.match(typesSource, /sendUi:/, 'neutral sendUi helper missing')
  assert.match(typesSource, /editMessage:/, 'neutral edit helper missing')
  assert.match(typesSource, /react:/, 'neutral react helper missing')
  assert.match(typesSource, /isGroupAdmin\?: boolean/, 'neutral group-admin state missing')
  assert.match(typesSource, /isBotGroupAdmin\?: boolean/, 'neutral bot-admin state missing')

  assert.match(
    roadmap,
    /## B2\. Un solo Command Engine[\s\S]*Estado: (?:EN PROGRESO|TERMINADO)/,
    'B2 roadmap state missing',
  )

  const { CommandEngine } = await import('../apps/bot/dist/core/command-engine.js')
  const calls = []
  const fakeAdapter = {
    id: 'telegram',
    botInstanceId: 'b2-smoke',
    capabilities: {
      editMessage: true, reactions: true, typing: true, buttons: true, carousel: true,
      embeds: false, files: true, polls: false, groupModeration: false, maxUploadBytes: 20_000_000,
    },
    async start() {},
    async stop() {},
    async sendText(chatId, text) { calls.push(['text', chatId, text]); return { platform: 'telegram', chatId, messageId: String(calls.length) } },
    async sendMedia(chatId) { return { platform: 'telegram', chatId, messageId: String(calls.length + 1) } },
    async sendUi(chatId) { return { platform: 'telegram', chatId, messageId: String(calls.length + 1) } },
    async editMessage() {},
    async setTyping() {},
    async react() {},
  }
  const command = {
    name: 'b2echo',
    aliases: ['b2say'],
    category: 'general',
    description: 'B2 engine smoke',
    async handler(ctx) { await ctx.reply(`echo:${ctx.argText}`) },
  }
  const engine = new CommandEngine([command])
  assert.equal(engine.resolve('B2SAY'), command, 'shared engine alias resolution failed')

  const ctx = {
    platform: 'telegram',
    adapter: fakeAdapter,
    normalizedMessage: {
      platform: 'telegram', botInstanceId: 'b2-smoke', chatId: '42', senderId: 'telegram:7',
      messageId: '9', text: '/b2echo test', isGroup: false,
    },
    chatId: '42',
    sender: 'telegram:7',
    pushName: 'B2',
    commandName: 'b2echo',
    args: ['test'],
    argText: 'test',
    prefix: '/',
    settings: {},
    locale: 'es',
    t: (key) => key,
    isOwner: false,
    isBotStaff: false,
    isGroup: false,
    isSubbotOwner: false,
    reply: async (text) => { calls.push(['reply', text]) },
    react: async () => {},
    sendText: fakeAdapter.sendText,
    sendMedia: fakeAdapter.sendMedia,
    sendUi: fakeAdapter.sendUi,
    setTyping: async () => {},
    editMessage: async () => {},
  }
  const result = await engine.execute(command, ctx, { instanceKey: 'b2-smoke' })
  assert.equal(result.allowed, true)
  assert.deepEqual(calls.at(-1), ['reply', 'echo:test'])

  console.log('Phase B2 shared CommandEngine smoke passed')
} finally {
  await rm(temp, { recursive: true, force: true })
}
