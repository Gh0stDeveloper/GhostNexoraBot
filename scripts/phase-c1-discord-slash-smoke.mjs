import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const {
  buildDiscordApplicationCommands,
  discordApplicationCommands,
  normalizeDiscordApplicationCommandName,
} = await import('../apps/bot/dist/platform/discord/application-commands.js')
const { platformCommandMetadata } = await import('../apps/bot/dist/services/command-metadata.js')

const catalog = platformCommandMetadata('discord')
const discoverable = catalog.filter((metadata) =>
  metadata.platforms.includes('discord') && metadata.discoverable)
const names = discordApplicationCommands.map((command) => command.name)

assert.equal(new Set(names).size, names.length, 'C1 must never register duplicate slash command names')
assert.ok(names.length > 0, 'C1 must generate at least one Discord slash command')

for (const metadata of discoverable) {
  const expectedTokens = [...new Set([metadata.name, ...metadata.aliases]
    .map(normalizeDiscordApplicationCommandName)
    .filter(Boolean))]
  for (const token of expectedTokens) {
    assert.ok(names.includes(token), `discoverable Discord metadata token /${token} must be registered`)
  }
}

for (const metadata of catalog.filter((item) => !item.discoverable)) {
  for (const raw of [metadata.name, ...metadata.aliases]) {
    const token = normalizeDiscordApplicationCommandName(raw)
    assert.ok(!names.includes(token), `non-discoverable command /${token} must stay hidden from slash registration`)
  }
}

for (const command of discordApplicationCommands) {
  assert.match(command.name, /^[a-z0-9_-]{1,32}$/, `invalid slash command name: ${command.name}`)
  assert.ok(command.description.length >= 1 && command.description.length <= 100)
  assert.ok(command.description_localizations?.['en-US'])
  assert.ok(command.description_localizations?.['en-GB'])
  assert.ok(command.description_localizations?.['es-ES'])
  assert.ok(command.description_localizations?.['es-419'])

  let optionalSeen = false
  for (const option of command.options ?? []) {
    assert.match(option.name, /^[a-z0-9_-]{1,32}$/, `invalid slash option name: ${command.name} ${option.name}`)
    assert.ok(option.description.length >= 1 && option.description.length <= 100)
    assert.ok(option.description_localizations?.['en-US'])
    assert.ok(option.description_localizations?.['es-419'])
    if (option.required) assert.equal(optionalSeen, false, `required options must precede optional options on /${command.name}`)
    else optionalSeen = true
    if (option.max_length !== undefined) {
      assert.ok(option.max_length >= 1 && option.max_length <= 6000)
    }
  }
}

const help = discordApplicationCommands.find((command) => command.name === 'help')
assert.ok(help, '/help must remain registered')
assert.notEqual(
  help.description_localizations?.['en-US'],
  help.description_localizations?.['es-419'],
  'localized Discord descriptions must preserve English and Spanish variants',
)

const vk = discordApplicationCommands.find((command) => command.name === 'vk')
assert.ok(vk, '/vk must remain registered')
const vkUrl = vk.options?.find((option) => option.name === 'url')
assert.equal(vkUrl?.required, true, '/vk url must remain required')
assert.equal(vkUrl?.max_length, 1900, '/vk url max length must come from central metadata')

const language = discordApplicationCommands.find((command) => command.name === 'language')
const languageValue = language?.options?.find((option) => option.name === 'value')
assert.equal(languageValue?.required, false, '/language value must stay optional')
assert.equal(languageValue?.max_length, 100, '/language value max length must come from central metadata')

assert.ok(names.includes('start'), 'existing /start alias must remain available')
assert.ok(names.includes('menu'), 'existing /menu alias must remain available')
assert.ok(names.includes('version'), 'existing /version alias must remain available')
assert.ok(names.includes('about'), 'shared alias metadata must be reflected without router duplication')
assert.ok(!names.includes('apkmirrordl'), 'implementation/detail commands must remain non-discoverable')
assert.ok(!names.includes('apkpuredl'), 'implementation/detail commands must remain non-discoverable')

const permissions = {
  ownerOnly: false,
  staffOnly: false,
  subbotOwnerAllowed: false,
  groupOnly: false,
  adminOnly: false,
  botAdminOnly: false,
}
const baseMetadata = {
  category: 'general',
  description: 'Synthetic C1 command',
  arguments: [],
  permissions,
  platforms: ['discord'],
  requiredCapabilities: [],
  discoverable: true,
}
assert.throws(
  () => buildDiscordApplicationCommands([
    { ...baseMetadata, name: 'alpha', aliases: ['same'] },
    { ...baseMetadata, name: 'beta', aliases: ['same'] },
  ]),
  /collision/i,
  'C1 must fail fast when two metadata commands normalize to the same slash token',
)

assert.deepEqual(
  buildDiscordApplicationCommands([{ ...baseMetadata, name: 'whatsapp-only', aliases: [], platforms: ['whatsapp'] }]),
  [],
  'Discord registration must respect platform availability',
)

const metadataSource = await readFile(new URL('../apps/bot/src/services/command-metadata.ts', import.meta.url), 'utf8')
assert.doesNotMatch(metadataSource, /slashTokens/, 'manual slash token registries must not return after C1')

const routerSource = await readFile(new URL('../apps/bot/src/platform/discord/router.ts', import.meta.url), 'utf8')
assert.doesNotMatch(routerSource, /discordApplicationCommands/, 'Discord router must not duplicate slash registration metadata')
assert.match(routerSource, /handleMessage\(message: DiscordMessage\)/, 'Discord message commands must remain supported')
assert.match(routerSource, /SharedCommandEngine/, 'SharedCommandEngine integration must remain intact')
assert.match(routerSource, /createRequestContext/, 'B5 immutable RequestContext integration must remain intact')

console.log(`Phase C1 Discord slash metadata smoke passed · ${discordApplicationCommands.length} slash commands generated from ${discoverable.length} discoverable metadata entries`)
