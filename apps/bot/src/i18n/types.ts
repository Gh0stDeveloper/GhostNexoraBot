export const SUPPORTED_LOCALES = ['es', 'en'] as const

export type LocaleCode = typeof SUPPORTED_LOCALES[number]
export type MessageStyle = 'default'
export type TranslationValues = Record<string, string | number | boolean | null | undefined>
export type TranslationCatalog = Record<string, string>

export function isSupportedLocale(value: unknown): value is LocaleCode {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value.toLowerCase())
}

export function normalizeLocale(value: unknown, fallback: LocaleCode = 'es'): LocaleCode {
  return isSupportedLocale(value) ? value.toLowerCase() as LocaleCode : fallback
}
