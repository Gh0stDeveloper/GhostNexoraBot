import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ghost Nexora Bot | WhatsApp Multi-Device',
  description: 'Bot profesional para WhatsApp Multi-Device con stickers, descargas, administración de grupos y panel web.',
  applicationName: 'Ghost Nexora Bot',
  openGraph: {
    title: 'Ghost Nexora Bot',
    description: 'WhatsApp Multi-Device bot by Ghost Developer / Nexora.',
    type: 'website',
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
