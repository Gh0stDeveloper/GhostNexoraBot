import type { CapabilityName, PlatformId } from '@ghostnexora/platform-contracts'
import type {
  BotCommand,
  CommandArgumentMetadata,
  CommandCategory,
} from '../types.js'
import { sharedNeutralCommands } from '../commands/shared-neutral.js'

export type CommandPermissionMetadata = {
  ownerOnly: boolean
  staffOnly: boolean
  subbotOwnerAllowed: boolean
  groupOnly: boolean
  adminOnly: boolean
  botAdminOnly: boolean
}

export type CommandMetadata = {
  name: string
  aliases: string[]
  category: CommandCategory
  description: string
  usage?: string
  arguments: CommandArgumentMetadata[]
  permissions: CommandPermissionMetadata
  platforms: PlatformId[]
  requiredCapabilities: CapabilityName[]
  discoverable: boolean
}

type NativePlatformCommand = {
  name: string
  aliases?: readonly string[]
  category: CommandCategory
  description: string
  usage?: string
  arguments?: readonly CommandArgumentMetadata[]
  permissions?: Partial<CommandPermissionMetadata>
  requiredCapabilities?: readonly CapabilityName[]
  discoverable?: boolean
  slashTokens?: readonly string[]
}

const emptyPermissions = (): CommandPermissionMetadata => ({
  ownerOnly: false,
  staffOnly: false,
  subbotOwnerAllowed: false,
  groupOnly: false,
  adminOnly: false,
  botAdminOnly: false,
})

const discordNativeCommands: readonly NativePlatformCommand[] = [
  {
    name: 'help',
    aliases: ['start', 'menu', 'ayuda'],
    category: 'general',
    description: 'Muestra los comandos disponibles en Discord.',
    slashTokens: ['start', 'help', 'menu'],
  },
  {
    name: 'ping',
    category: 'general',
    description: 'Comprueba latencia y disponibilidad.',
    slashTokens: ['ping'],
  },
  {
    name: 'info',
    aliases: ['version', 'botinfo'],
    category: 'general',
    description: 'Información del bot y del runtime de Discord.',
    slashTokens: ['info', 'version'],
  },
  {
    name: 'language',
    aliases: ['lang', 'idioma'],
    category: 'general',
    description: 'Consulta o cambia el idioma efectivo.',
    usage: 'language [value]',
    arguments: [{ name: 'value', description: 'Idioma, alcance o estado.', required: false, maxLength: 100 }],
    slashTokens: ['language'],
  },
  {
    name: 'vk',
    aliases: ['vkvideo', 'vkd'],
    category: 'downloads',
    description: 'Descarga un video de VK.',
    usage: 'vk <url>',
    arguments: [{ name: 'url', description: 'URL pública de VK.', required: true, maxLength: 1900 }],
    requiredCapabilities: ['files'],
    slashTokens: ['vk'],
  },
  {
    name: 'apkmirror',
    aliases: ['apkm', 'amirror'],
    category: 'downloads',
    description: 'Busca aplicaciones en APKMirror.',
    usage: 'apkmirror <query>',
    arguments: [{ name: 'query', description: 'Aplicación a buscar.', required: true, maxLength: 200 }],
    slashTokens: ['apkmirror'],
  },
  {
    name: 'apkmirrordl',
    aliases: ['amdl'],
    category: 'downloads',
    description: 'Descarga una selección previa de APKMirror.',
    usage: 'apkmirrordl <token>',
    arguments: [{ name: 'token', description: 'Token de una selección previa.', required: true, maxLength: 512 }],
    requiredCapabilities: ['files'],
    discoverable: false,
  },
  {
    name: 'apkpure',
    aliases: ['apkp', 'pureapk'],
    category: 'downloads',
    description: 'Busca aplicaciones en APKPure.',
    usage: 'apkpure <query>',
    arguments: [{ name: 'query', description: 'Aplicación o paquete a buscar.', required: true, maxLength: 200 }],
    slashTokens: ['apkpure'],
  },
  {
    name: 'apkpuredl',
    aliases: ['apdl'],
    category: 'downloads',
    description: 'Descarga una selección previa de APKPure.',
    usage: 'apkpuredl <token>',
    arguments: [{ name: 'token', description: 'Token de una selección previa.', required: true, maxLength: 512 }],
    requiredCapabilities: ['files'],
    discoverable: false,
  },
  {
    name: 'providerhealth',
    aliases: ['dlhealth'],
    category: 'owner',
    description: 'Muestra el estado de los providers de descarga.',
    permissions: { staffOnly: true },
    slashTokens: ['providerhealth'],
  },
  {
    name: 'discordstatus',
    aliases: ['dcstatus'],
    category: 'owner',
    description: 'Muestra el estado operativo del runtime Discord.',
    permissions: { ownerOnly: true },
    slashTokens: ['discordstatus'],
  },
]

const telegramNativeCommands: readonly NativePlatformCommand[] = [
  {
    name: 'help',
    aliases: ['start', 'menu', 'ayuda'],
    category: 'general',
    description: 'Muestra los comandos disponibles en Telegram.',
  },
  {
    name: 'ping',
    category: 'general',
    description: 'Comprueba latencia y disponibilidad.',
  },
  {
    name: 'info',
    aliases: ['version', 'botinfo'],
    category: 'general',
    description: 'Información del bot y del runtime de Telegram.',
  },
  {
    name: 'language',
    aliases: ['lang', 'idioma'],
    category: 'general',
    description: 'Consulta o cambia el idioma efectivo.',
    usage: 'language [value]',
    arguments: [{ name: 'value', description: 'Idioma, alcance o estado.', required: false, maxLength: 100 }],
  },
  {
    name: 'vk',
    aliases: ['vkvideo', 'vkd'],
    category: 'downloads',
    description: 'Descarga un video de VK.',
    usage: 'vk <url>',
    arguments: [{ name: 'url', description: 'URL pública de VK.', required: true, maxLength: 1900 }],
    requiredCapabilities: ['files'],
  },
  {
    name: 'apkmirror',
    aliases: ['apkm', 'amirror'],
    category: 'downloads',
    description: 'Busca aplicaciones en APKMirror.',
    usage: 'apkmirror <query>',
    arguments: [{ name: 'query', description: 'Aplicación a buscar.', required: true, maxLength: 200 }],
  },
  {
    name: 'apkmirrordl',
    aliases: ['amdl'],
    category: 'downloads',
    description: 'Descarga una selección previa de APKMirror.',
    usage: 'apkmirrordl <token>',
    arguments: [{ name: 'token', description: 'Token de una selección previa.', required: true, maxLength: 512 }],
    requiredCapabilities: ['files'],
    discoverable: false,
  },
  {
    name: 'apkpure',
    aliases: ['apkp', 'pureapk'],
    category: 'downloads',
    description: 'Busca aplicaciones en APKPure.',
    usage: 'apkpure <query>',
    arguments: [{ name: 'query', description: 'Aplicación o paquete a buscar.', required: true, maxLength: 200 }],
  },
  {
    name: 'apkpuredl',
    aliases: ['apdl'],
    category: 'downloads',
    description: 'Descarga una selección previa de APKPure.',
    usage: 'apkpuredl <token>',
    arguments: [{ name: 'token', description: 'Token de una selección previa.', required: true, maxLength: 512 }],
    requiredCapabilities: ['files'],
    discoverable: false,
  },
  {
    name: 'providerhealth',
    aliases: ['dlhealth'],
    category: 'owner',
    description: 'Muestra el estado de los providers de descarga.',
    permissions: { staffOnly: true },
  },
  {
    name: 'tgstatus',
    aliases: ['telegramstatus'],
    category: 'owner',
    description: 'Muestra el estado operativo del runtime Telegram.',
    permissions: { ownerOnly: true },
  },
]

function nativeCommands(platform: PlatformId): readonly NativePlatformCommand[] {
  if (platform === 'discord') return discordNativeCommands
  if (platform === 'telegram') return telegramNativeCommands
  return []
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase()
}

function uniqueTokens(values: readonly string[]) {
  return [...new Set(values.map(normalizeToken).filter(Boolean))]
}

function inferArguments(usage: string | undefined, commandName: string): CommandArgumentMetadata[] {
  if (!usage?.trim()) return []
  const tokens = usage.trim().split(/\s+/)
  const first = (tokens[0] ?? '').replace(/^[./!#]+/, '').toLowerCase()
  const args = first === commandName.toLowerCase() ? tokens.slice(1) : tokens
  return args
    .filter((token) => /^<.+>$|^\[.+\]$/.test(token))
    .map((token) => {
      const required = token.startsWith('<')
      const raw = token.slice(1, -1)
      const variadic = raw.endsWith('...')
      return {
        name: (variadic ? raw.slice(0, -3) : raw).replace(/[^a-zA-Z0-9_-]/g, '_') || 'value',
        required,
        variadic,
      }
    })
}

function permissionsFromCommand(command: Pick<BotCommand,
  'ownerOnly' | 'staffOnly' | 'subbotOwnerAllowed' | 'groupOnly' | 'adminOnly' | 'botAdminOnly'
>): CommandPermissionMetadata {
  return {
    ownerOnly: command.ownerOnly === true,
    staffOnly: command.staffOnly === true,
    subbotOwnerAllowed: command.subbotOwnerAllowed === true,
    groupOnly: command.groupOnly === true,
    adminOnly: command.adminOnly === true,
    botAdminOnly: command.botAdminOnly === true,
  }
}

function nativeMetadata(platform: PlatformId, command: NativePlatformCommand): CommandMetadata {
  return {
    name: normalizeToken(command.name),
    aliases: uniqueTokens(command.aliases ?? []),
    category: command.category,
    description: command.description.trim(),
    ...(command.usage ? { usage: command.usage.trim() } : {}),
    arguments: (command.arguments ?? inferArguments(command.usage, command.name)).map((argument) => ({ ...argument })),
    permissions: { ...emptyPermissions(), ...(command.permissions ?? {}) },
    platforms: [platform],
    requiredCapabilities: [...(command.requiredCapabilities ?? [])],
    discoverable: command.discoverable !== false,
  }
}

function mergeMetadata(base: CommandMetadata, extension: CommandMetadata): CommandMetadata {
  return {
    ...base,
    aliases: uniqueTokens([...base.aliases, ...extension.aliases]),
    description: base.description || extension.description,
    usage: base.usage ?? extension.usage,
    arguments: base.arguments.length ? base.arguments : extension.arguments,
    permissions: {
      ownerOnly: base.permissions.ownerOnly || extension.permissions.ownerOnly,
      staffOnly: base.permissions.staffOnly || extension.permissions.staffOnly,
      subbotOwnerAllowed: base.permissions.subbotOwnerAllowed || extension.permissions.subbotOwnerAllowed,
      groupOnly: base.permissions.groupOnly || extension.permissions.groupOnly,
      adminOnly: base.permissions.adminOnly || extension.permissions.adminOnly,
      botAdminOnly: base.permissions.botAdminOnly || extension.permissions.botAdminOnly,
    },
    platforms: [...new Set([...base.platforms, ...extension.platforms])],
    requiredCapabilities: [...new Set([...base.requiredCapabilities, ...extension.requiredCapabilities])],
    discoverable: base.discoverable && extension.discoverable,
  }
}

function sharedTokenMap() {
  const map = new Map<string, string>()
  for (const command of sharedNeutralCommands) {
    const canonical = normalizeToken(command.name)
    for (const token of [command.name, ...(command.aliases ?? [])]) map.set(normalizeToken(token), canonical)
  }
  return map
}

const sharedTokens = sharedTokenMap()

function platformNativeTokenMap(platform: PlatformId) {
  const map = new Map<string, string>()
  for (const command of nativeCommands(platform)) {
    const canonical = normalizeToken(command.name)
    for (const token of [command.name, ...(command.aliases ?? [])]) map.set(normalizeToken(token), canonical)
  }
  return map
}

const discordNativeTokens = platformNativeTokenMap('discord')
const telegramNativeTokens = platformNativeTokenMap('telegram')

export const DISCORD_COMMAND_ALIAS_ENTRIES = [...discordNativeTokens.entries()] as Array<[string, string]>
export const TELEGRAM_COMMAND_ALIAS_ENTRIES = [...telegramNativeTokens.entries()] as Array<[string, string]>

function combinedPlatformAliasMap(platform: 'discord' | 'telegram') {
  const map = new Map<string, string>(platform === 'discord' ? discordNativeTokens : telegramNativeTokens)
  for (const [token, canonical] of sharedTokens) {
    if (!map.has(token)) map.set(token, canonical)
  }
  return map
}

export const discordCommandAliases = combinedPlatformAliasMap('discord')
export const telegramCommandAliases = combinedPlatformAliasMap('telegram')

export type CommandPlatformSupport = {
  whatsapp: boolean
  discord: boolean
  telegram: boolean
}

function normalizedTokens(command: Pick<BotCommand, 'name' | 'aliases'>) {
  return uniqueTokens([command.name, ...(command.aliases ?? [])])
}

export function commandPlatformSupport(
  command: Pick<BotCommand, 'name' | 'aliases' | 'platforms'>,
): CommandPlatformSupport {
  const explicit = command.platforms?.length ? new Set(command.platforms) : null
  if (explicit) {
    return {
      whatsapp: explicit.has('whatsapp'),
      discord: explicit.has('discord'),
      telegram: explicit.has('telegram'),
    }
  }

  const tokens = normalizedTokens(command)
  return {
    whatsapp: true,
    discord: tokens.some((token) => discordCommandAliases.has(token)),
    telegram: tokens.some((token) => telegramCommandAliases.has(token)),
  }
}

export function hasFullCommandParity(command: Pick<BotCommand, 'name' | 'aliases' | 'platforms'>) {
  const support = commandPlatformSupport(command)
  return support.whatsapp && support.discord && support.telegram
}

export function buildCommandMetadata(command: BotCommand): CommandMetadata {
  const support = commandPlatformSupport(command)
  const platforms: PlatformId[] = []
  if (support.whatsapp) platforms.push('whatsapp')
  if (support.discord) platforms.push('discord')
  if (support.telegram) platforms.push('telegram')

  return {
    name: normalizeToken(command.name),
    aliases: uniqueTokens(command.aliases ?? []),
    category: command.category,
    description: command.description.trim(),
    ...(command.usage?.trim() ? { usage: command.usage.trim() } : {}),
    arguments: (command.arguments ?? inferArguments(command.usage, command.name)).map((argument) => ({ ...argument })),
    permissions: permissionsFromCommand(command),
    platforms,
    requiredCapabilities: [...(command.requiresCapabilities ?? [])],
    discoverable: command.discoverable !== false,
  }
}

export function commandMetadataCatalog(commands: readonly BotCommand[]) {
  return commands.map(buildCommandMetadata)
}

export function platformCommandMetadata(platform: PlatformId): CommandMetadata[] {
  const byName = new Map<string, CommandMetadata>()

  for (const command of sharedNeutralCommands) {
    const metadata = buildCommandMetadata(command)
    if (!metadata.platforms.includes(platform)) continue
    byName.set(metadata.name, metadata)
  }

  for (const command of nativeCommands(platform)) {
    const metadata = nativeMetadata(platform, command)
    const previous = byName.get(metadata.name)
    byName.set(metadata.name, previous ? mergeMetadata(previous, metadata) : metadata)
  }

  return [...byName.values()].sort((left, right) =>
    left.category.localeCompare(right.category) || left.name.localeCompare(right.name),
  )
}

export function commandMetadataForPlatformToken(platform: PlatformId, token: string) {
  const normalized = normalizeToken(token)
  const aliases = platform === 'discord'
    ? discordCommandAliases
    : platform === 'telegram'
      ? telegramCommandAliases
      : new Map<string, string>()
  const canonical = aliases.get(normalized) ?? normalized
  return platformCommandMetadata(platform).find((command) => command.name === canonical)
}

export function commandMetadataVisibleTo(
  metadata: CommandMetadata,
  input: { isOwner: boolean; isStaff: boolean; isSubbotOwner?: boolean; isGroup?: boolean },
) {
  if (!metadata.discoverable) return false
  if (metadata.permissions.ownerOnly && !input.isOwner) return false
  if (
    metadata.permissions.staffOnly
    && !input.isStaff
    && !input.isOwner
    && !(metadata.permissions.subbotOwnerAllowed && input.isSubbotOwner)
  ) return false
  if (metadata.permissions.groupOnly && input.isGroup === false) return false
  return true
}

export function discordSlashCommandTokens() {
  return discordNativeCommands.flatMap((command) => command.slashTokens ?? [])
}
