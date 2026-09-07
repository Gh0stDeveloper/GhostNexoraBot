import { community } from '../services/community.js'
import { settings } from '../core/settings.js'
import { messages as esDefault, legacyReplacements as esLegacy } from './locales/es/default.js'
import { messages as enDefault, legacyReplacements as enLegacy } from './locales/en/default.js'
import { messages as esSystem } from './locales/es/system.js'
import { messages as enSystem } from './locales/en/system.js'
import { normalizeLocale, type LocaleCode, type TranslationValues } from './types.js'

const catalogs = {
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

export function resolveChatLocale(chatId?: string | null): LocaleCode {
  const globalLocale = normalizeLocale(settings.language, 'es')
  if (!chatId?.endsWith('@g.us')) return globalLocale
  const groupLocale = community.getGroupSettings(chatId).language
  return groupLocale ? normalizeLocale(groupLocale, globalLocale) : globalLocale
}

export function localizeLegacyText(text: string, locale: LocaleCode) {
  if (!text || locale === 'es') return text
  let output = text
  for (const [source, target] of replacements[locale].slice().sort((a, b) => b[0].length - a[0].length)) {
    if (source && output.includes(source)) output = output.split(source).join(target)
  }
  return output
}

export function translateForChat(chatId: string | null | undefined, key: string, values: TranslationValues = {}) {
  return translate(resolveChatLocale(chatId), key, values)
}

export type { LocaleCode, TranslationValues } from './types.js'
