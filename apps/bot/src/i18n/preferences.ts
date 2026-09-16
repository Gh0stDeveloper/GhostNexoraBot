import type { PlatformId } from '@ghostnexora/platform-contracts'
import { economy } from '../services/economy.js'
import { isSupportedLocale, normalizeLocale, type LocaleCode } from './types.js'

export type LocalePreferenceScope = 'bot' | 'chat' | 'user'

export type LocalePreferenceKey = {
  platform: PlatformId
  botInstanceId: string
  scope: LocalePreferenceScope
  scopeId: string
}

const db = economy.db
const now = () => Date.now()

db.exec(`
  CREATE TABLE IF NOT EXISTS i18n_preferences (
    platform TEXT NOT NULL,
    bot_instance_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    locale TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(platform, bot_instance_id, scope, scope_id)
  );
  CREATE INDEX IF NOT EXISTS idx_i18n_preferences_lookup
    ON i18n_preferences(platform, bot_instance_id, scope, scope_id);
`)

function clean(value: string | number | null | undefined) {
  return String(value ?? '').trim()
}

function validKey(key: LocalePreferenceKey) {
  return Boolean(clean(key.platform) && clean(key.botInstanceId) && clean(key.scope) && clean(key.scopeId))
}

export const localePreferences = {
  get(key: LocalePreferenceKey): LocaleCode | null {
    if (!validKey(key)) return null
    const row = db.prepare(`SELECT locale FROM i18n_preferences
      WHERE platform = ? AND bot_instance_id = ? AND scope = ? AND scope_id = ?`)
      .get(key.platform, clean(key.botInstanceId), key.scope, clean(key.scopeId)) as { locale?: string } | undefined
    return isSupportedLocale(row?.locale) ? normalizeLocale(row?.locale) : null
  },

  set(key: LocalePreferenceKey, locale: LocaleCode) {
    if (!validKey(key)) throw new Error('Invalid i18n preference key.')
    const normalized = normalizeLocale(locale, 'es')
    db.prepare(`INSERT INTO i18n_preferences(platform, bot_instance_id, scope, scope_id, locale, updated_at)
      VALUES(?, ?, ?, ?, ?, ?)
      ON CONFLICT(platform, bot_instance_id, scope, scope_id)
      DO UPDATE SET locale = excluded.locale, updated_at = excluded.updated_at`)
      .run(key.platform, clean(key.botInstanceId), key.scope, clean(key.scopeId), normalized, now())
    return normalized
  },

  clear(key: LocalePreferenceKey) {
    if (!validKey(key)) return false
    const result = db.prepare(`DELETE FROM i18n_preferences
      WHERE platform = ? AND bot_instance_id = ? AND scope = ? AND scope_id = ?`)
      .run(key.platform, clean(key.botInstanceId), key.scope, clean(key.scopeId))
    return Number(result.changes ?? 0) > 0
  },

  list(platform: PlatformId, botInstanceId: string) {
    return db.prepare(`SELECT scope, scope_id AS scopeId, locale, updated_at AS updatedAt
      FROM i18n_preferences WHERE platform = ? AND bot_instance_id = ?
      ORDER BY scope, scope_id`)
      .all(platform, clean(botInstanceId)) as Array<{
        scope: LocalePreferenceScope
        scopeId: string
        locale: LocaleCode
        updatedAt: number
      }>
  },
}
