import type { PlatformId } from '@ghostnexora/platform-contracts'
import type { BotCommand, CommandCategory } from '../types.js'
import { opsDb, opsInstanceKey } from './ops-database.js'

export const COMMAND_PERMISSION_MODES = ['inherit', 'staff', 'owner'] as const
export type CommandPermissionMode = typeof COMMAND_PERMISSION_MODES[number]

export type CommandRuntimeConfig = {
  enabled: boolean
  whatsapp: boolean
  discord: boolean
  telegram: boolean
  cooldownMs: number
  allowGroups: boolean
  allowPrivate: boolean
  permissionMode: CommandPermissionMode
  categoryEnabled: boolean
}

export type CommandRuntimeDecision =
  | { allowed: true; commandName: string; config: CommandRuntimeConfig }
  | {
      allowed: false
      commandName: string
      config: CommandRuntimeConfig
      reason: 'disabled' | 'category_disabled' | 'platform_disabled' | 'groups_disabled' | 'private_disabled' | 'permission' | 'cooldown'
      remainingMs?: number
    }

opsDb.exec(`
  CREATE TABLE IF NOT EXISTS ops_command_settings (
    instance_key TEXT NOT NULL,
    command_name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    whatsapp INTEGER NOT NULL DEFAULT 1,
    discord INTEGER NOT NULL DEFAULT 1,
    telegram INTEGER NOT NULL DEFAULT 1,
    cooldown_ms INTEGER NOT NULL DEFAULT 0,
    allow_groups INTEGER NOT NULL DEFAULT 1,
    allow_private INTEGER NOT NULL DEFAULT 1,
    permission_mode TEXT NOT NULL DEFAULT 'inherit',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(instance_key, command_name)
  );
  CREATE INDEX IF NOT EXISTS idx_ops_command_settings_instance
    ON ops_command_settings(instance_key, updated_at DESC);

  CREATE TABLE IF NOT EXISTS ops_command_category_settings (
    instance_key TEXT NOT NULL,
    category TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(instance_key, category)
  );

  CREATE TABLE IF NOT EXISTS ops_command_aliases (
    instance_key TEXT NOT NULL,
    token TEXT NOT NULL,
    command_name TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(instance_key, token)
  );
  CREATE INDEX IF NOT EXISTS idx_ops_command_aliases_command
    ON ops_command_aliases(instance_key, command_name);

  CREATE TABLE IF NOT EXISTS ops_command_cooldowns (
    instance_key TEXT NOT NULL,
    platform TEXT NOT NULL,
    command_name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    last_used_at INTEGER NOT NULL,
    PRIMARY KEY(instance_key, platform, command_name, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_ops_command_cooldowns_last_used
    ON ops_command_cooldowns(last_used_at);
`)

function normalizeCommandName(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/^\.+/, '').slice(0, 80)
}

function permissionMode(value: unknown): CommandPermissionMode {
  const normalized = String(value ?? '').trim().toLowerCase()
  return (COMMAND_PERMISSION_MODES as readonly string[]).includes(normalized)
    ? normalized as CommandPermissionMode
    : 'inherit'
}

function booleanValue(value: unknown, fallback = true) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  }
  return fallback
}

function cooldownValue(value: unknown) {
  const parsed = Math.trunc(Number(value ?? 0))
  if (!Number.isFinite(parsed)) return 0
  return Math.min(24 * 60 * 60_000, Math.max(0, parsed))
}

export function registerCommandTokens(command: Pick<BotCommand, 'name' | 'aliases'>, instanceKey = opsInstanceKey()) {
  const commandName = normalizeCommandName(command.name)
  if (!commandName) return
  const tokens = [...new Set([command.name, ...(command.aliases ?? [])].map(normalizeCommandName).filter(Boolean))]
  const statement = opsDb.prepare(`INSERT INTO ops_command_aliases(instance_key, token, command_name, updated_at)
    VALUES(?, ?, ?, ?)
    ON CONFLICT(instance_key, token) DO UPDATE SET
      command_name = excluded.command_name,
      updated_at = excluded.updated_at`)
  const stamp = Date.now()
  for (const token of tokens) statement.run(instanceKey, token, commandName, stamp)
}

export function resolveConfiguredCommandName(commandToken: string, instanceKey = opsInstanceKey()) {
  const token = normalizeCommandName(commandToken)
  if (!token) return ''
  const row = opsDb.prepare(`SELECT command_name AS commandName
    FROM ops_command_aliases WHERE instance_key = ? AND token = ?`)
    .get(instanceKey, token) as { commandName?: string } | undefined
  return normalizeCommandName(row?.commandName || token)
}

export function resolveConfiguredCommandCategory(commandToken: string, fallback: CommandCategory | string = 'general', instanceKey = opsInstanceKey()) {
  const commandName = resolveConfiguredCommandName(commandToken, instanceKey)
  const row = opsDb.prepare(`SELECT category FROM ops_command_catalog
    WHERE instance_key = ? AND command_name = ?`).get(instanceKey, commandName) as { category?: string } | undefined
  return String(row?.category || fallback)
}

export function getCommandRuntimeConfig(commandName: string, category: CommandCategory | string, instanceKey = opsInstanceKey()): CommandRuntimeConfig {
  const canonical = resolveConfiguredCommandName(commandName, instanceKey)
  const row = opsDb.prepare(`SELECT enabled, whatsapp, discord, telegram, cooldown_ms AS cooldownMs,
      allow_groups AS allowGroups, allow_private AS allowPrivate, permission_mode AS permissionMode
    FROM ops_command_settings WHERE instance_key = ? AND command_name = ?`)
    .get(instanceKey, canonical) as Record<string, unknown> | undefined
  const categoryRow = opsDb.prepare(`SELECT enabled FROM ops_command_category_settings
    WHERE instance_key = ? AND category = ?`).get(instanceKey, String(category)) as { enabled?: unknown } | undefined

  return {
    enabled: booleanValue(row?.enabled, true),
    whatsapp: booleanValue(row?.whatsapp, true),
    discord: booleanValue(row?.discord, true),
    telegram: booleanValue(row?.telegram, true),
    cooldownMs: cooldownValue(row?.cooldownMs),
    allowGroups: booleanValue(row?.allowGroups, true),
    allowPrivate: booleanValue(row?.allowPrivate, true),
    permissionMode: permissionMode(row?.permissionMode),
    categoryEnabled: booleanValue(categoryRow?.enabled, true),
  }
}

function platformEnabled(config: CommandRuntimeConfig, platform: PlatformId) {
  if (platform === 'whatsapp') return config.whatsapp
  if (platform === 'discord') return config.discord
  if (platform === 'telegram') return config.telegram
  return false
}

function remainingCooldown(instanceKey: string, platform: PlatformId, commandName: string, userId: string, cooldownMs: number) {
  if (cooldownMs <= 0 || !userId) return 0
  const row = opsDb.prepare(`SELECT last_used_at AS lastUsedAt FROM ops_command_cooldowns
    WHERE instance_key = ? AND platform = ? AND command_name = ? AND user_id = ?`)
    .get(instanceKey, platform, commandName, userId) as { lastUsedAt?: number } | undefined
  return Math.max(0, Number(row?.lastUsedAt ?? 0) + cooldownMs - Date.now())
}

export function markCommandCooldown(platform: PlatformId, commandName: string, userId: string, instanceKey = opsInstanceKey()) {
  const canonical = resolveConfiguredCommandName(commandName, instanceKey)
  if (!canonical || !userId) return
  const stamp = Date.now()
  opsDb.prepare(`INSERT INTO ops_command_cooldowns(instance_key, platform, command_name, user_id, last_used_at)
    VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(instance_key, platform, command_name, user_id) DO UPDATE SET last_used_at = excluded.last_used_at`)
    .run(instanceKey, platform, canonical, userId, stamp)
  if (Math.random() < 0.01) {
    opsDb.prepare('DELETE FROM ops_command_cooldowns WHERE last_used_at < ?').run(stamp - 7 * 86_400_000)
  }
}

export function commandRuntimeDecision(input: {
  commandName: string
  category: CommandCategory | string
  platform: PlatformId
  isGroup: boolean
  userId: string
  isOwner?: boolean
  isStaff?: boolean
  isSubbotOwner?: boolean
  instanceKey?: string
}): CommandRuntimeDecision {
  const instanceKey = input.instanceKey ?? opsInstanceKey()
  const commandName = resolveConfiguredCommandName(input.commandName, instanceKey)
  const config = getCommandRuntimeConfig(commandName, input.category, instanceKey)

  if (!config.enabled) return { allowed: false, commandName, config, reason: 'disabled' }
  if (!config.categoryEnabled) return { allowed: false, commandName, config, reason: 'category_disabled' }
  if (!platformEnabled(config, input.platform)) return { allowed: false, commandName, config, reason: 'platform_disabled' }
  if (input.isGroup && !config.allowGroups) return { allowed: false, commandName, config, reason: 'groups_disabled' }
  if (!input.isGroup && !config.allowPrivate) return { allowed: false, commandName, config, reason: 'private_disabled' }

  const elevated = Boolean(input.isOwner || input.isStaff || input.isSubbotOwner)
  if (config.permissionMode === 'owner' && !input.isOwner && !input.isSubbotOwner) {
    return { allowed: false, commandName, config, reason: 'permission' }
  }
  if (config.permissionMode === 'staff' && !elevated) {
    return { allowed: false, commandName, config, reason: 'permission' }
  }

  if (!elevated && config.cooldownMs > 0) {
    const remainingMs = remainingCooldown(instanceKey, input.platform, commandName, input.userId, config.cooldownMs)
    if (remainingMs > 0) return { allowed: false, commandName, config, reason: 'cooldown', remainingMs }
  }

  return { allowed: true, commandName, config }
}
