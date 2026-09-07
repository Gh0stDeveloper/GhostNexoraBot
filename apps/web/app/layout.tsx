import type { Metadata } from 'next'
import PublicQuickStart from '../components/PublicQuickStart'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ghost Nexora Bot | Ecosistema para WhatsApp',
  description: 'Ghost Nexora Bot reúne inteligencia artificial, descargas, economía, juegos, moderación, stickers, colecciones, personalización y subbots para comunidades de WhatsApp.',
  applicationName: 'Ghost Nexora Bot',
  keywords: ['Ghost Nexora Bot', 'WhatsApp bot', 'Nexora', 'Ghost Developer', 'subbots', 'economía NXC', 'moderación de grupos'],
  openGraph: {
    title: 'Ghost Nexora Bot',
    description: 'Un ecosistema completo para comunidades de WhatsApp: IA, descargas, economía, juegos, moderación, personalización y subbots.',
    type: 'website',
    locale: 'es_MX',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ghost Nexora Bot',
    description: 'IA, descargas, economía, juegos, moderación y subbots dentro de WhatsApp.',
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {children}
        <PublicQuickStart />
      </body>
    </html>
  )
}
