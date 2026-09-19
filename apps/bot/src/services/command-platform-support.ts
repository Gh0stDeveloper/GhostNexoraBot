import type { BotCommand } from '../types.js'

export type CommandPlatformSupport = {
  whatsapp: boolean
  discord: boolean
  telegram: boolean
}

// These maps describe the command tokens that are actually accepted by the
// native Discord and Telegram routers today. Keeping them outside the routers
// gives Operations Center one authoritative parity source without pretending
// that the full WhatsApp registry is already multiplatform.
export const DISCORD_COMMAND_ALIAS_ENTRIES = [
  ['start', 'help'], ['help', 'help'], ['menu', 'help'], ['ayuda', 'help'],
  ['ping', 'ping'], ['info', 'info'], ['version', 'version'], ['botinfo', 'info'],
  ['language', 'language'], ['lang', 'language'], ['idioma', 'language'],
  ['vk', 'vk'], ['vkvideo', 'vk'], ['vkd', 'vk'],
  ['apkmirror', 'apkmirror'], ['apkm', 'apkmirror'], ['amirror', 'apkmirror'],
  ['apkmirrordl', 'apkmirrordl'], ['amdl', 'apkmirrordl'],
  ['apkpure', 'apkpure'], ['apkp', 'apkpure'], ['pureapk', 'apkpure'],
  ['apkpuredl', 'apkpuredl'], ['apdl', 'apkpuredl'],
  ['providerhealth', 'providerhealth'], ['dlhealth', 'providerhealth'],
  ['discordstatus', 'discordstatus'], ['dcstatus', 'discordstatus'],
] as const satisfies ReadonlyArray<readonly [string, string]>

export const TELEGRAM_COMMAND_ALIAS_ENTRIES = [
  ['start', 'help'], ['help', 'help'], ['menu', 'help'], ['ayuda', 'help'],
  ['ping', 'ping'], ['info', 'info'], ['version', 'version'], ['botinfo', 'info'],
  ['language', 'language'], ['lang', 'language'], ['idioma', 'language'],
  ['vk', 'vk'], ['vkvideo', 'vk'], ['vkd', 'vk'],
  ['apkmirror', 'apkmirror'], ['apkm', 'apkmirror'], ['amirror', 'apkmirror'],
  ['apkmirrordl', 'apkmirrordl'], ['amdl', 'apkmirrordl'],
  ['apkpure', 'apkpure'], ['apkp', 'apkpure'], ['pureapk', 'apkpure'],
  ['apkpuredl', 'apkpuredl'], ['apdl', 'apkpuredl'],
  ['providerhealth', 'providerhealth'], ['dlhealth', 'providerhealth'],
  ['tgstatus', 'tgstatus'], ['telegramstatus', 'tgstatus'],
] as const satisfies ReadonlyArray<readonly [string, string]>

export const discordCommandAliases = new Map<string, string>(DISCORD_COMMAND_ALIAS_ENTRIES)
export const telegramCommandAliases = new Map<string, string>(TELEGRAM_COMMAND_ALIAS_ENTRIES)

const discordTokens = new Set<string>(DISCORD_COMMAND_ALIAS_ENTRIES.map(([token]) => token))
const telegramTokens = new Set<string>(TELEGRAM_COMMAND_ALIAS_ENTRIES.map(([token]) => token))

function normalizedTokens(command: Pick<BotCommand, 'name' | 'aliases'>) {
  return [command.name, ...(command.aliases ?? [])]
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
}

export function commandPlatformSupport(command: Pick<BotCommand, 'name' | 'aliases'>): CommandPlatformSupport {
  const tokens = normalizedTokens(command)
  return {
    whatsapp: true,
    discord: tokens.some((token) => discordTokens.has(token)),
    telegram: tokens.some((token) => telegramTokens.has(token)),
  }
}

export function hasFullCommandParity(command: Pick<BotCommand, 'name' | 'aliases'>) {
  const support = commandPlatformSupport(command)
  return support.whatsapp && support.discord && support.telegram
}
