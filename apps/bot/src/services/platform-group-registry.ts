import { opsDb, opsInstanceKey } from './ops-database.js'

export type OpsPlatform = 'whatsapp' | 'discord' | 'telegram'

export type PlatformGroupRecord = {
  externalId: string
  name: string
  kind: string
  memberCount?: number | null
  adminCount?: number | null
  botAdmin?: boolean | null
  authoritative?: boolean
  source?: string
  metadata?: Record<string, unknown> | null
}

opsDb.exec(`
  CREATE TABLE IF NOT EXISTS ops_platform_groups (
    instance_key TEXT NOT NULL,
    platform TEXT NOT NULL,
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'group',
    member_count INTEGER,
    admin_count INTEGER,
    bot_admin INTEGER,
    authoritative INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'runtime',
    metadata_json TEXT,
    first_seen_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(instance_key, platform, external_id)
  );
  CREATE INDEX IF NOT EXISTS idx_ops_platform_groups_instance_platform
    ON ops_platform_groups(instance_key, platform, updated_at DESC);
`)

function cleanCount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  return Math.max(0, Math.trunc(value))
}

function metadataJson(value: Record<string, unknown> | null | undefined) {
  if (!value) return null
  try { return JSON.stringify(value).slice(0, 4000) } catch { return null }
}

export function upsertPlatformGroup(
  platform: OpsPlatform,
  group: PlatformGroupRecord,
  instanceKey = opsInstanceKey(),
  stamp = Date.now(),
) {
  const externalId = String(group.externalId ?? '').trim()
  if (!externalId) return false
  const name = String(group.name || externalId).trim().slice(0, 300) || externalId
  const kind = String(group.kind || 'group').trim().slice(0, 40) || 'group'
  const memberCount = cleanCount(group.memberCount)
  const adminCount = cleanCount(group.adminCount)
  const botAdmin = group.botAdmin === null || group.botAdmin === undefined ? null : (group.botAdmin ? 1 : 0)
  const authoritative = group.authoritative ? 1 : 0
  const source = String(group.source || 'runtime').trim().slice(0, 80) || 'runtime'
  const metadata = metadataJson(group.metadata)

  opsDb.prepare(`INSERT INTO ops_platform_groups(
      instance_key, platform, external_id, name, kind, member_count, admin_count, bot_admin,
      authoritative, source, metadata_json, first_seen_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(instance_key, platform, external_id) DO UPDATE SET
      name = CASE
        WHEN excluded.name = excluded.external_id AND ops_platform_groups.name <> ops_platform_groups.external_id
          THEN ops_platform_groups.name
        WHEN excluded.name <> '' THEN excluded.name
        ELSE ops_platform_groups.name
      END,
      kind = excluded.kind,
      member_count = COALESCE(excluded.member_count, ops_platform_groups.member_count),
      admin_count = COALESCE(excluded.admin_count, ops_platform_groups.admin_count),
      bot_admin = COALESCE(excluded.bot_admin, ops_platform_groups.bot_admin),
      authoritative = MAX(ops_platform_groups.authoritative, excluded.authoritative),
      source = excluded.source,
      metadata_json = COALESCE(excluded.metadata_json, ops_platform_groups.metadata_json),
      updated_at = excluded.updated_at`)
    .run(
      instanceKey,
      platform,
      externalId,
      name,
      kind,
      memberCount,
      adminCount,
      botAdmin,
      authoritative,
      source,
      metadata,
      stamp,
      stamp,
    )
  return true
}

export function replacePlatformGroups(
  platform: OpsPlatform,
  groups: PlatformGroupRecord[],
  instanceKey = opsInstanceKey(),
  stamp = Date.now(),
) {
  opsDb.exec('BEGIN IMMEDIATE')
  try {
    const ids: string[] = []
    for (const group of groups) {
      const externalId = String(group.externalId ?? '').trim()
      if (!externalId) continue
      ids.push(externalId)
      upsertPlatformGroup(platform, { ...group, authoritative: true }, instanceKey, stamp)
    }

    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',')
      opsDb.prepare(`DELETE FROM ops_platform_groups
        WHERE instance_key = ? AND platform = ? AND external_id NOT IN (${placeholders})`)
        .run(instanceKey, platform, ...ids)
    } else {
      opsDb.prepare('DELETE FROM ops_platform_groups WHERE instance_key = ? AND platform = ?')
        .run(instanceKey, platform)
    }
    opsDb.exec('COMMIT')
  } catch (error) {
    opsDb.exec('ROLLBACK')
    throw error
  }
}

export function removePlatformGroup(
  platform: OpsPlatform,
  externalId: string,
  instanceKey = opsInstanceKey(),
) {
  opsDb.prepare('DELETE FROM ops_platform_groups WHERE instance_key = ? AND platform = ? AND external_id = ?')
    .run(instanceKey, platform, externalId)
}


export function countPlatformGroups(
  platform: OpsPlatform,
  instanceKey = opsInstanceKey(),
) {
  const row = opsDb.prepare(`SELECT COUNT(*) AS count
    FROM ops_platform_groups
    WHERE instance_key = ? AND platform = ?`).get(instanceKey, platform) as { count?: number } | undefined
  return Number(row?.count ?? 0)
}
