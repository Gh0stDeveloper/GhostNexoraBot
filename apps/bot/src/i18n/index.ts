import type { NormalizedUi, PlatformId } from '@ghostnexora/platform-contracts'
import { community } from '../services/community.js'
import { settings } from '../core/settings.js'
import { messages as esDefault, legacyReplacements as esLegacy } from './locales/es/default.js'
import { messages as enDefault, legacyReplacements as enLegacy } from './locales/en/default.js'
import { messages as esSystem } from './locales/es/system.js'
import { messages as enSystem } from './locales/en/system.js'
import { messages as esPhase6 } from './locales/es/phase6.js'
import { messages as enPhase6 } from './locales/en/phase6.js'
import { localePreferences, type LocalePreferenceScope } from './preferences.js'
import {
  DEFAULT_LOCALE,
  localeFromLanguageTag,
  normalizeLocale,
  type LocaleCode,
  type TranslationValues,
} from './types.js'

export const catalogs = {
  es: { ...esDefault, ...esSystem, ...esPhase6 },
  en: { ...enDefault, ...enSystem, ...enPhase6 },
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
  const privateUser = chatId && !chatId.endsWith('@g.us') ? chatId : undefined
  return resolvePlatformLocale({
    platform: 'whatsapp',
    botInstanceId,
    chatId,
    userId: userId ?? privateUser,
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

/** Localizes legacy NormalizedUi labels while preserving action IDs/URLs. */
export function localizeNormalizedUi(ui: NormalizedUi, locale: LocaleCode): NormalizedUi {
  if (locale === 'es') return ui
  if (ui.kind === 'text') return { ...ui, text: localizeLegacyText(ui.text, locale) }
  if (ui.kind === 'card') return {
    ...ui,
    title: localizeLegacyText(ui.title, locale),
    body: ui.body ? localizeLegacyText(ui.body, locale) : ui.body,
    footer: ui.footer ? localizeLegacyText(ui.footer, locale) : ui.footer,
    buttons: ui.buttons?.map((button) => ({ ...button, label: localizeLegacyText(button.label, locale) })),
  }
  if (ui.kind === 'list') return {
    ...ui,
    title: ui.title ? localizeLegacyText(ui.title, locale) : ui.title,
    body: ui.body ? localizeLegacyText(ui.body, locale) : ui.body,
    items: ui.items.map((item) => ({
      ...item,
      title: localizeLegacyText(item.title, locale),
      description: item.description ? localizeLegacyText(item.description, locale) : item.description,
      action: item.action ? { ...item.action, label: localizeLegacyText(item.action.label, locale) } : item.action,
    })),
  }
  return {
    ...ui,
    title: ui.title ? localizeLegacyText(ui.title, locale) : ui.title,
    cards: ui.cards.map((card) => ({
      ...card,
      title: localizeLegacyText(card.title, locale),
      body: card.body ? localizeLegacyText(card.body, locale) : card.body,
      footer: card.footer ? localizeLegacyText(card.footer, locale) : card.footer,
      buttons: card.buttons?.map((button) => ({ ...button, label: localizeLegacyText(button.label, locale) })),
    })),
  }
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
