import path from 'node:path'
import { config } from '../../config.js'

function ids(value = '') {
  return new Set(value.split(/[\s,;]+/).map((item) => item.trim()).filter((item) => /^\d+$/.test(item)))
}

function enabled(value: string | undefined, fallback = false) {
  if (value === undefined || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

export const telegramConfig = {
  token: config.telegramBotToken.trim(),
  channelId: config.telegramChannelId.trim(),
  channelUrl: config.telegramChannelUrl.trim(),
  owners: ids(process.env.TELEGRAM_OWNER_IDS),
  staff: ids(process.env.TELEGRAM_STAFF_IDS),
  deleteWebhookOnStart: enabled(process.env.TELEGRAM_DELETE_WEBHOOK_ON_START, false),
  dropPendingUpdatesOnWebhookDelete: enabled(process.env.TELEGRAM_DROP_PENDING_UPDATES, false),
  pollTimeoutSeconds: Math.min(50, Math.max(5, Number(process.env.TELEGRAM_POLL_TIMEOUT_SECONDS || 25))),
  reconnectDelayMs: Math.min(60_000, Math.max(1000, Number(process.env.TELEGRAM_RECONNECT_DELAY_MS || 3000))),
  stateFile: process.env.TELEGRAM_PLATFORM_STATE_FILE
    ? path.resolve(process.env.TELEGRAM_PLATFORM_STATE_FILE)
    : path.join(config.dataDir, 'telegram-platform', 'state.json'),
} as const

export function telegramOwner(userId: number | string | undefined) {
  return userId !== undefined && telegramConfig.owners.has(String(userId))
}

export function telegramStaff(userId: number | string | undefined) {
  return userId !== undefined && (telegramOwner(userId) || telegramConfig.staff.has(String(userId)))
}
