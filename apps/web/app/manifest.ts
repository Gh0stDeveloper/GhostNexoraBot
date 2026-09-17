import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ghost Nexora Bot',
    short_name: 'Ghost Nexora',
    description: 'Official Ghost Nexora Bot web application and operations panel.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#080809',
    theme_color: '#080809',
    categories: ['utilities', 'productivity'],
    icons: [
      {
        src: '/pwa-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/pwa-icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
