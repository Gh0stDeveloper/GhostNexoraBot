import { translate } from '../../i18n/index.js'
import {
  platformCommandMetadata,
  type CommandMetadata,
} from '../../services/command-metadata.js'
import type { DiscordApplicationCommandDefinition } from './types.js'

const DISCORD_COMMAND_LIMIT = 100
const DISCORD_NAME_LIMIT = 32
const DISCORD_DESCRIPTION_LIMIT = 100
const DISCORD_STRING_MAX_LENGTH = 6000

function slashDescription(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return (normalized || 'Ghost Nexora Bot command').slice(0, DISCORD_DESCRIPTION_LIMIT)
}

function localizedSlashDescription(value: string, key?: string) {
  const es = slashDescription(key ? translate('es', key) : value)
  const en = slashDescription(key ? translate('en', key) : value)
  return {
    description: es,
    description_localizations: {
      'en-US': en,
      'en-GB': en,
      'es-ES': es,
      'es-419': es,
    },
  }
}

export function normalizeDiscordApplicationCommandName(value: string) {
  return value
    .trim()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, DISCORD_NAME_LIMIT)
}

function discordOptionMaxLength(value: number | undefined, commandName: string, optionName: string) {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || value < 1 || value > DISCORD_STRING_MAX_LENGTH) {
    throw new Error(`Discord slash option maxLength out of range: /${commandName} ${optionName}=${value}`)
  }
  return value
}

function commandTokens(metadata: CommandMetadata) {
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const raw of [metadata.name, ...metadata.aliases]) {
    const token = normalizeDiscordApplicationCommandName(raw)
    if (!token) throw new Error(`Discord slash command has an invalid empty name after normalization: ${raw}`)
    if (seen.has(token)) continue
    seen.add(token)
    tokens.push(token)
  }
  return tokens
}

function optionsFor(metadata: CommandMetadata) {
  const names = new Set<string>()
  return metadata.arguments
    .map((argument, index) => ({ argument, index }))
    .sort((left, right) =>
      Number(right.argument.required === true) - Number(left.argument.required === true)
      || left.index - right.index)
    .map(({ argument }) => {
      const name = normalizeDiscordApplicationCommandName(argument.name)
      if (!name) throw new Error(`Discord slash option has an invalid name on /${metadata.name}`)
      if (names.has(name)) throw new Error(`Discord slash option collision on /${metadata.name}: ${name}`)
      names.add(name)
      const maxLength = discordOptionMaxLength(argument.maxLength, metadata.name, name)
      return {
        type: 3 as const,
        name,
        ...localizedSlashDescription(argument.description || argument.name, argument.descriptionKey),
        required: argument.required === true,
        ...(maxLength === undefined ? {} : { max_length: maxLength }),
      }
    })
}

export function buildDiscordApplicationCommands(
  metadataCatalog: readonly CommandMetadata[] = platformCommandMetadata('discord'),
): DiscordApplicationCommandDefinition[] {
  const owners = new Map<string, string>()
  const commands: DiscordApplicationCommandDefinition[] = []

  for (const metadata of metadataCatalog) {
    if (!metadata.platforms.includes('discord') || !metadata.discoverable) continue
    const options = optionsFor(metadata)

    for (const token of commandTokens(metadata)) {
      const owner = owners.get(token)
      if (owner && owner !== metadata.name) {
        throw new Error(`Discord slash command collision: /${token} belongs to both ${owner} and ${metadata.name}`)
      }
      if (owner) continue
      owners.set(token, metadata.name)
      commands.push({
        name: token,
        ...localizedSlashDescription(metadata.description, metadata.descriptionKey),
        dm_permission: !metadata.permissions.groupOnly,
        ...(options.length ? { options } : {}),
      })
    }
  }

  if (commands.length > DISCORD_COMMAND_LIMIT) {
    throw new Error(`Discord slash command limit exceeded: ${commands.length}/${DISCORD_COMMAND_LIMIT}`)
  }

  return commands.sort((left, right) => left.name.localeCompare(right.name))
}

export const discordApplicationCommands = buildDiscordApplicationCommands()
