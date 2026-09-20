'use client'

import dynamic from 'next/dynamic'
import { PlanetLabels } from './labels'
import { SolarOverlay } from './overlay'
import type { SolarSystemLocale } from '../../lib/solar-system-i18n'

const SolarCanvas = dynamic(() => import('./scene').then((module) => module.SolarCanvas), {
  ssr: false,
})

export function NexoraSolarExplorer({ locale }: { locale: SolarSystemLocale }) {
  return (
    <div className="relative h-[calc(100dvh-4.5rem)] min-h-[680px] w-full overflow-hidden bg-[#02030a] lg:h-dvh">
      <SolarCanvas />
      <PlanetLabels locale={locale}/>
      <SolarOverlay locale={locale}/>
      <div className="pointer-events-none absolute inset-0 z-[5] bg-[radial-gradient(circle_at_center,transparent_52%,rgba(0,0,0,.36)_100%)]"/>
    </div>
  )
}
