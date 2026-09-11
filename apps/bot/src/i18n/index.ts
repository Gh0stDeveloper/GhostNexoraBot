import type { PlatformId } from '@ghostnexora/platform-contracts'
import { community } from '../services/community.js'
import { settings } from '../core/settings.js'
import { messages as esDefault, legacyReplacements as esLegacy } from './locales/es/default.js'
import { messages as enDefault, legacyReplacements as enLegacy } from './locales/en/default.js'
import { messages as esSystem } from './locales/es/system.js'
import { messages as enSystem } from './locales/en/system.js'
import { localePreferences, type LocalePreferenceScope } from './preferences.js'
import {
  DEFAULT_LOCALE,
  localeFromLanguageTag,
  normalizeLocale,
  type LocaleCode,
  type TranslationValues,
} from './types.js'

export const catalogs = {
  es: { ...esDefault, ...esSystem },
  en: { ...enDefault, ...enSystem },
} as const
const replacements = { es: esLegacy, en: enLegacy } as const

function interpolate(template: string, values: TranslationValues = {}) {
  return template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (_match, key: string) => {
    const value = values[key]
    return value === null || value === undefined ? `{${key}}` : String(value)
  })
}

export function translate(locale: LocaleCode, key: string, values: TranslationValues = {}) {
  const catalog = catalogs[locale] ?? catalogs.es
  const template = catalog[key] ?? catalogs.es[key] ?? key
  return interpolate(template, values)
}

export function localeName(locale: LocaleCode, displayLocale: LocaleCode = locale) {
  return translate(displayLocale, `language.name.${locale}`)
}

export type PlatformLocaleContext = {
  platform: PlatformId
  botInstanceId: string
  chatId?: string | number | null
  userId?: string | number | null
  clientLocale?: string | null
  fallback?: LocaleCode
}

function storedLocale(
  context: PlatformLocaleContext,
  scope: LocalePreferenceScope,
  scopeId: string | number | null | undefined,
) {
  const id = String(scopeId ?? '').trim()
  if (!id) return null
  return localePreferences.get({
    platform: context.platform,
    botInstanceId: context.botInstanceId,
    scope,
    scopeId: id,
  })
}

/**
 * Phase 6 locale policy. Explicit preferences always win over inferred locale:
 * user -> chat -> legacy WhatsApp group -> bot/platform -> client hint -> global -> es.
 */
export function resolvePlatformLocale(context: PlatformLocaleContext): LocaleCode {
  const globalLocale = normalizeLocale(settings.language, context.fallback ?? DEFAULT_LOCALE)
  const userLocale = storedLocale(context, 'user', context.userId)
  if (userLocale) return userLocale

  const chatLocale = storedLocale(context, 'chat', context.chatId)
  if (chatLocale) return chatLocale

  if (context.platform === 'whatsapp') {
    const chatId = String(context.chatId ?? '')
    if (chatId.endsWith('@g.us')) {
      const legacyGroupLocale = community.getGroupSettings(chatId).language
      if (legacyGroupLocale) return normalizeLocale(legacyGroupLocale, globalLocale)
    }
  }

  const botLocale = storedLocale(context, 'bot', 'self')
  if (botLocale) return botLocale

  const clientLocale = localeFromLanguageTag(context.clientLocale)
  if (clientLocale) return clientLocale
  return globalLocale
}

/** Backward-compatible WhatsApp resolver used by V1 services. */
export function resolveChatLocale(
  chatId?: string | null,
  userId?: string | null,
  botInstanceId = 'main',
): LocaleCode {
  return resolvePlatformLocale({
    platform: 'whatsapp',
    botInstanceId,
    chatId,
    userId,
  })
}

export function setPlatformLocale(
  context: Pick<PlatformLocaleContext, 'platform' | 'botInstanceId'>,
  scope: LocalePreferenceScope,
  scopeId: string | number,
  locale: LocaleCode,
) {
  return localePreferences.set({
    platform: context.platform,
    botInstanceId: context.botInstanceId,
    scope,
    scopeId: String(scopeId),
  }, locale)
}

export function clearPlatformLocale(
  context: Pick<PlatformLocaleContext, 'platform' | 'botInstanceId'>,
  scope: LocalePreferenceScope,
  scopeId: string | number,
) {
  return localePreferences.clear({
    platform: context.platform,
    botInstanceId: context.botInstanceId,
    scope,
    scopeId: String(scopeId),
  })
}

export function platformLocalePreference(
  context: Pick<PlatformLocaleContext, 'platform' | 'botInstanceId'>,
  scope: LocalePreferenceScope,
  scopeId: string | number,
) {
  return localePreferences.get({
    platform: context.platform,
    botInstanceId: context.botInstanceId,
    scope,
    scopeId: String(scopeId),
  })
}

function applyLegacyReplacements(text: string, locale: LocaleCode) {
  let output = text
  for (const [source, target] of replacements[locale].slice().sort((a, b) => b[0].length - a[0].length)) {
    if (source && output.includes(source)) output = output.split(source).join(target)
  }
  return output
}

export function localizeLegacyText(text: string, locale: LocaleCode) {
  if (!text || locale === 'es') return text
  // Do not translate Markdown code blocks: they can contain literal commands,
  // source code or examples that must remain byte-for-byte compatible.
  const segments = text.split(/(```[\s\S]*?```)/g)
  return segments.map((segment) => segment.startsWith('```') ? segment : applyLegacyReplacements(segment, locale)).join('')
}

export function translateForChat(chatId: string | null | undefined, key: string, values: TranslationValues = {}) {
  return translate(resolveChatLocale(chatId), key, values)
}

export function catalogParityReport() {
  const es = new Set(Object.keys(catalogs.es))
  const en = new Set(Object.keys(catalogs.en))
  return {
    esKeys: es.size,
    enKeys: en.size,
    missingInEs: [...en].filter((key) => !es.has(key)).sort(),
    missingInEn: [...es].filter((key) => !en.has(key)).sort(),
  }
}

export function assertCatalogParity() {
  const report = catalogParityReport()
  if (report.missingInEs.length || report.missingInEn.length) {
    throw new Error(`i18n catalog mismatch: missingInEs=${report.missingInEs.join(',')} missingInEn=${report.missingInEn.join(',')}`)
  }
  return report
}

export type { LocaleCode, TranslationValues } from './types.js'
export { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale, localeFromLanguageTag, normalizeLocale } from './types.js'
