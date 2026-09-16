export const SUPPORTED_LOCALES = ['es', 'en'] as const
export const DEFAULT_LOCALE = 'es' as const

export type LocaleCode = typeof SUPPORTED_LOCALES[number]
export type MessageStyle = 'default'
export type TranslationValues = Record<string, string | number | boolean | null | undefined>
export type TranslationCatalog = Record<string, string>

export function isSupportedLocale(value: unknown): value is LocaleCode {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value.toLowerCase())
}

/**
 * Converts client language tags such as es-MX, es_419 or en-US into one of the
 * locales shipped by Ghost Nexora Bot. Unknown languages return null instead of
 * silently changing the user's language.
 */
export function localeFromLanguageTag(value: unknown): LocaleCode | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase().replaceAll('_', '-')
  if (!normalized) return null
  if (isSupportedLocale(normalized)) return normalized
  const base = normalized.split('-', 1)[0]
  return isSupportedLocale(base) ? base : null
}

export function normalizeLocale(value: unknown, fallback: LocaleCode = DEFAULT_LOCALE): LocaleCode {
  return localeFromLanguageTag(value) ?? fallback
}
