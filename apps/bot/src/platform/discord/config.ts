import path from 'node:path'
import { config } from '../../config.js'

function ids(value = '') {
  return new Set(value.split(/[\s,;]+/).map((item) => item.trim()).filter((item) => /^\d+$/.test(item)))
}

function enabled(value: string | undefined, fallback = false) {
  if (value === undefined || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function integer(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback)
  return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

export const DISCORD_GATEWAY_INTENTS = {
  guilds: 1 << 0,
  guildMessages: 1 << 9,
  directMessages: 1 << 12,
  messageContent: 1 << 15,
} as const

const messageContentEnabled = enabled(process.env.DISCORD_MESSAGE_CONTENT_ENABLED, false)
const baseIntents = DISCORD_GATEWAY_INTENTS.guilds | DISCORD_GATEWAY_INTENTS.guildMessages | DISCORD_GATEWAY_INTENTS.directMessages

export const discordConfig = {
  token: (process.env.DISCORD_BOT_TOKEN || '').trim(),
  owners: ids(process.env.DISCORD_OWNER_IDS),
  staff: ids(process.env.DISCORD_STAFF_IDS),
  guildId: (process.env.DISCORD_GUILD_ID || '').trim(),
  messageContentEnabled,
  registerCommands: enabled(process.env.DISCORD_REGISTER_COMMANDS, true),
  intents: baseIntents | (messageContentEnabled ? DISCORD_GATEWAY_INTENTS.messageContent : 0),
  reconnectDelayMs: integer(process.env.DISCORD_RECONNECT_DELAY_MS, 3000, 1000, 60_000),
  maxReconnectDelayMs: integer(process.env.DISCORD_MAX_RECONNECT_DELAY_MS, 60_000, 5000, 300_000),
  stateFile: process.env.DISCORD_PLATFORM_STATE_FILE
    ? path.resolve(process.env.DISCORD_PLATFORM_STATE_FILE)
    : path.join(config.dataDir, 'discord-platform', 'state.json'),
} as const

export function discordOwner(userId: string | number | undefined) {
  return userId !== undefined && discordConfig.owners.has(String(userId))
}

export function discordStaff(userId: string | number | undefined) {
  return userId !== undefined && (discordOwner(userId) || discordConfig.staff.has(String(userId)))
}
