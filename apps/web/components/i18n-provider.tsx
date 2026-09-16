'use client'

import { Languages } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { webIntlLocale, webLocaleName, webT, type WebLocale, type WebMessageKey } from '../lib/i18n'

const COOKIE_NAME = 'gnb_locale'

type WebI18nValue = {
  locale: WebLocale
  intlLocale: string
  t: (key: WebMessageKey, values?: Record<string, string | number | null | undefined>) => string
  setLocale: (locale: WebLocale) => void
}

const WebI18nContext = createContext<WebI18nValue | null>(null)

export function WebI18nProvider({ locale, children }: { locale: WebLocale; children: ReactNode }) {
  const router = useRouter()
  const t = useCallback((key: WebMessageKey, values: Record<string, string | number | null | undefined> = {}) => webT(locale, key, values), [locale])
  const setLocale = useCallback((next: WebLocale) => {
    document.cookie = `${COOKIE_NAME}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
    document.documentElement.lang = next
    router.refresh()
  }, [router])
  const value = useMemo(() => ({ locale, intlLocale: webIntlLocale(locale), t, setLocale }), [locale, setLocale, t])
  return <WebI18nContext.Provider value={value}>{children}</WebI18nContext.Provider>
}

export function useWebI18n() {
  const value = useContext(WebI18nContext)
  if (!value) throw new Error('useWebI18n must be used inside WebI18nProvider')
  return value
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useWebI18n()
  const other: WebLocale = locale === 'es' ? 'en' : 'es'
  return <button
    type="button"
    onClick={() => setLocale(other)}
    className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-xl border border-white/[.09] bg-[#111114]/92 px-3.5 py-2.5 text-xs font-bold text-zinc-300 shadow-xl backdrop-blur-xl transition hover:border-blue-500/30 hover:text-white"
    aria-label={t('language.switch')}
    title={t('language.switch')}
  >
    <Languages className="size-4 text-blue-400" />
    {webLocaleName(other, locale)}
  </button>
}
