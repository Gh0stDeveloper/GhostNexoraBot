import 'server-only'
import { cookies, headers } from 'next/headers'
import { normalizeWebLocale, type WebLocale } from './i18n'

export const WEB_LOCALE_COOKIE = 'gnb_locale'

export async function getWebLocale(): Promise<WebLocale> {
  const cookieStore = await cookies()
  const stored = cookieStore.get(WEB_LOCALE_COOKIE)?.value
  if (stored) return normalizeWebLocale(stored)

  const headerStore = await headers()
  const acceptLanguage = headerStore.get('accept-language') || ''
  const first = acceptLanguage.split(',')[0]?.split(';')[0]?.trim()
  return normalizeWebLocale(first, 'es')
}
