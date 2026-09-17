import type { Metadata } from 'next'
import PublicQuickStart from '../components/PublicQuickStart'
import { LanguageSwitcher, WebI18nProvider } from '../components/i18n-provider'
import { LegalFooter } from '../components/legal-footer'
import { PwaRegister } from '../components/pwa-register'
import { getWebLocale } from '../lib/i18n-server'
import { webT } from '../lib/i18n'
import './globals.css'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getWebLocale()
  return {
    title: webT(locale, 'meta.title'),
    description: webT(locale, 'meta.description'),
    applicationName: 'Ghost Nexora Bot',
    manifest: '/manifest.webmanifest',
    icons: {
      icon: '/pwa-icon.svg',
      shortcut: '/pwa-icon.svg',
      apple: '/pwa-icon.svg',
    },
    keywords: [
      'Ghost Nexora Bot', 'Ghost Nexora Manager', 'WhatsApp bot', 'Telegram bot', 'Discord bot',
      'Nexora', 'Ghost Developer', 'subbots', 'NXC', 'Android APK', 'Windows installer',
      'Linux AppImage', 'Ubuntu', 'Debian', 'RPM', 'official download',
    ],
    openGraph: {
      title: 'Ghost Nexora Bot',
      description: webT(locale, 'meta.ogDescription'),
      type: 'website',
      locale: locale === 'en' ? 'en_US' : 'es_MX',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Ghost Nexora Bot',
      description: webT(locale, 'meta.twitterDescription'),
    },
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getWebLocale()
  return (
    <html lang={locale}>
      <body>
        <WebI18nProvider locale={locale}>
          {children}
          <LegalFooter locale={locale} />
          <PublicQuickStart />
          <LanguageSwitcher />
          <PwaRegister />
        </WebI18nProvider>
      </body>
    </html>
  )
}
