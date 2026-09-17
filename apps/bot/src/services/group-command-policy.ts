import type { CommandCategory } from '../types.js'
import { opsDb, opsInstanceKey } from './ops-database.js'
import { recordOpsRuntimeLog } from './ops-runtime-log.js'

export const GROUP_POLICY_PROFILES = ['community', 'gaming', 'support', 'private', 'strict'] as const
export type GroupPolicyProfile = typeof GROUP_POLICY_PROFILES[number]
export type CategoryOverride = 'allow' | 'deny' | 'inherit'

export const COMMAND_CATEGORIES: readonly CommandCategory[] = [
  'general', 'profile', 'social', 'stickers', 'downloads', 'groups',
  'economy', 'games', 'collection', 'subbots', 'adult', 'tools', 'owner',
]

const PRESETS: Record<GroupPolicyProfile, ReadonlySet<CommandCategory>> = {
  community: new Set<CommandCategory>(['general', 'profile', 'social', 'stickers', 'downloads', 'groups', 'economy', 'games', 'collection', 'tools']),
  gaming: new Set<CommandCategory>(['general', 'profile', 'social', 'stickers', 'economy', 'games', 'collection', 'tools']),
  support: new Set<CommandCategory>(['general', 'profile', 'downloads', 'groups', 'tools']),
  private: new Set<CommandCategory>(['general', 'profile', 'tools']),
  strict: new Set<CommandCategory>(['general', 'groups']),
}

opsDb.exec(`
  CREATE TABLE IF NOT EXISTS ops_group_command_policy (
    instance_key TEXT NOT NULL,
    group_jid TEXT NOT NULL,
    profile TEXT NOT NULL DEFAULT 'community',
    category_overrides TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(instance_key, group_jid)
  );
  CREATE INDEX IF NOT EXISTS idx_ops_group_command_policy_instance_updated
    ON ops_group_command_policy(instance_key, updated_at DESC);
`)

function normalizeProfile(value: unknown): GroupPolicyProfile {
  const candidate = String(value ?? '').trim().toLowerCase()
  return (GROUP_POLICY_PROFILES as readonly string[]).includes(candidate) ? candidate as GroupPolicyProfile : 'community'
}

function normalizeCategory(value: unknown): CommandCategory | null {
  const candidate = String(value ?? '').trim().toLowerCase()
  return (COMMAND_CATEGORIES as readonly string[]).includes(candidate) ? candidate as CommandCategory : null
}

function parseOverrides(value: unknown): Partial<Record<CommandCategory, boolean>> {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: Partial<Record<CommandCategory, boolean>> = {}
    for (const [rawCategory, rawAllowed] of Object.entries(parsed as Record<string, unknown>)) {
      const category = normalizeCategory(rawCategory)
      if (category && typeof rawAllowed === 'boolean') result[category] = rawAllowed
    }
    return result
  } catch {
    return {}
  }
}

function ensure(groupJid: string, instanceKey: string) {
  opsDb.prepare(`INSERT OR IGNORE INTO ops_group_command_policy(instance_key, group_jid, profile, category_overrides, updated_at)
    VALUES(?, ?, 'community', '{}', ?)`).run(instanceKey, groupJid, Date.now())
}

export function getGroupCommandPolicy(groupJid: string, instanceKey = opsInstanceKey()) {
  ensure(groupJid, instanceKey)
  const row = opsDb.prepare(`SELECT profile, category_overrides AS overrides
    FROM ops_group_command_policy WHERE instance_key = ? AND group_jid = ?`).get(instanceKey, groupJid) as {
      profile?: string
      overrides?: string
    } | undefined
  const profile = normalizeProfile(row?.profile)
  const overrides = parseOverrides(row?.overrides)
  const effective = Object.fromEntries(COMMAND_CATEGORIES.map((category) => [
    category,
    typeof overrides[category] === 'boolean' ? overrides[category] : PRESETS[profile].has(category),
  ])) as Record<CommandCategory, boolean>
  return { profile, overrides, effective }
}

export function isGroupCommandCategoryAllowed(groupJid: string, category: CommandCategory, instanceKey = opsInstanceKey()) {
  return getGroupCommandPolicy(groupJid, instanceKey).effective[category] !== false
}

export function setGroupPolicyProfile(groupJid: string, profileValue: unknown, instanceKey = opsInstanceKey()) {
  if (!groupJid.endsWith('@g.us')) throw new Error('invalid_group')
  const profile = normalizeProfile(profileValue)
  ensure(groupJid, instanceKey)
  opsDb.prepare(`UPDATE ops_group_command_policy SET profile = ?, updated_at = ?
    WHERE instance_key = ? AND group_jid = ?`).run(profile, Date.now(), instanceKey, groupJid)
  recordOpsRuntimeLog('info', 'group-policy', `Profile ${profile} applied to ${groupJid}`, instanceKey)
  return getGroupCommandPolicy(groupJid, instanceKey)
}

export function setGroupCategoryOverride(groupJid: string, categoryValue: unknown, modeValue: unknown, instanceKey = opsInstanceKey()) {
  if (!groupJid.endsWith('@g.us')) throw new Error('invalid_group')
  const category = normalizeCategory(categoryValue)
  if (!category) throw new Error('invalid_category')
  const mode = String(modeValue ?? '').trim().toLowerCase() as CategoryOverride
  if (!['allow', 'deny', 'inherit'].includes(mode)) throw new Error('invalid_override_mode')
  const current = getGroupCommandPolicy(groupJid, instanceKey)
  const overrides = { ...current.overrides }
  if (mode === 'inherit') delete overrides[category]
  else overrides[category] = mode === 'allow'
  opsDb.prepare(`UPDATE ops_group_command_policy SET category_overrides = ?, updated_at = ?
    WHERE instance_key = ? AND group_jid = ?`).run(JSON.stringify(overrides), Date.now(), instanceKey, groupJid)
  recordOpsRuntimeLog('info', 'group-policy', `Category ${category} set to ${mode} for ${groupJid}`, instanceKey)
  return getGroupCommandPolicy(groupJid, instanceKey)
}
