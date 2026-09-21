'use client'

import {
  ArrowLeft,
  ExternalLink,
  Maximize2,
  Mountain,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  heliosTerrainRegions,
  type HeliosTerrainRegion,
} from '../lib/nexora-helios-terrain-data'
import type { HeliosSurfaceId } from '../lib/nexora-helios-surface-data'
import { nexoraHeliosCopy, type NexoraHeliosLocale } from '../lib/nexora-helios-i18n'

function coordinateLabel(region: HeliosTerrainRegion) {
  if (region.latitude == null || region.longitude == null) return null
  const lat = `${Math.abs(region.latitude).toFixed(2)}° ${region.latitude >= 0 ? 'N' : 'S'}`
  const lon = `${Math.abs(region.longitude).toFixed(2)}° ${region.longitude >= 0 ? 'E' : 'W'}`
  return `${lat} · ${lon}`
}

function providerName(region: HeliosTerrainRegion) {
  return region.provider === 'nasa-trek'
    ? 'NASA Solar System Treks'
    : 'USGS 3D Elevation Program'
}

export function NexoraHeliosTerrainExplorer({
  locale,
  id,
  onClose,
}: {
  locale: NexoraHeliosLocale
  id: HeliosSurfaceId
  onClose: () => void
}) {
  const copy = nexoraHeliosCopy[locale]
  const terrain = copy.surface
  const body = copy.bodies[id]
  const regions = useMemo(() => heliosTerrainRegions(id), [id])
  const [regionId, setRegionId] = useState(regions[0]?.id ?? '')
  const region = regions.find((item) => item.id === regionId) ?? regions[0]
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)

  if (!region) return null

  const regionName = locale === 'es' ? region.nameEs : region.nameEn
  const note = locale === 'es' ? region.noteEs : region.noteEn
  const coordinate = coordinateLabel(region)
  const frameLoaded = loadedUrl === region.viewerUrl

  return <section
    className="absolute inset-0 z-[60] flex flex-col overflow-hidden bg-[#010205] text-white"
    aria-label={terrain.terrain3dTitle}
  >
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/70 px-3 py-3 backdrop-blur-xl md:px-5">
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[.18em] text-orange-300/75">{terrain.terrain3dEyebrow}</p>
        <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-lg font-black tracking-tight md:text-xl">{terrain.terrain3dTitle}</h2>
          <span className="truncate text-xs font-bold text-zinc-400">{body.name}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[.05] px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/[.09]"
      >
        <ArrowLeft className="size-4"/>
        <span className="hidden sm:inline">{terrain.terrain3dBack}</span>
      </button>
    </header>

    <div className="grid min-h-0 flex-1 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <aside className="order-2 max-h-[40vh] overflow-auto border-t border-white/10 bg-[#060911] p-3 lg:order-1 lg:max-h-none lg:border-r lg:border-t-0 lg:p-4">
        <div className="rounded-2xl border border-orange-300/15 bg-orange-300/[.045] p-3">
          <div className="flex items-center gap-2">
            <Mountain className="size-4 text-orange-200"/>
            <p className="text-[9px] font-black uppercase tracking-[.14em] text-orange-200/80">{terrain.terrain3d}</p>
          </div>
          <p className="mt-2 text-sm font-black text-white">{regionName}</p>
          <p className="mt-1 text-[10px] leading-5 text-zinc-400">{note}</p>
        </div>

        {regions.length > 1 ? <div className="mt-4">
          <p className="text-[9px] font-black uppercase tracking-[.12em] text-zinc-600">{terrain.terrain3dRegion}</p>
          <div className="mt-2 grid gap-1.5">
            {regions.map((item) => {
              const active = item.id === region.id
              return <button
                key={item.id}
                type="button"
                onClick={() => {
                  setRegionId(item.id)
                  setLoadedUrl(null)
                }}
                className={active
                  ? 'rounded-xl bg-white px-3 py-2.5 text-left text-[11px] font-black text-black'
                  : 'rounded-xl border border-white/[.08] bg-white/[.025] px-3 py-2.5 text-left text-[11px] font-bold text-zinc-300 hover:bg-white/[.06]'}
              >
                {locale === 'es' ? item.nameEs : item.nameEn}
              </button>
            })}
          </div>
        </div> : null}

        <dl className="mt-4 space-y-2">
          <div className="border-t border-white/[.07] pt-2">
            <dt className="text-[9px] font-bold uppercase tracking-[.1em] text-zinc-600">{terrain.terrain3dProvider}</dt>
            <dd className="mt-1 text-xs leading-5 text-zinc-300">{providerName(region)}</dd>
          </div>
          <div className="border-t border-white/[.07] pt-2">
            <dt className="text-[9px] font-bold uppercase tracking-[.1em] text-zinc-600">{terrain.terrain3dDataset}</dt>
            <dd className="mt-1 text-xs leading-5 text-zinc-300">{region.dataset}</dd>
          </div>
          {coordinate ? <div className="border-t border-white/[.07] pt-2">
            <dt className="text-[9px] font-bold uppercase tracking-[.1em] text-zinc-600">{terrain.terrain3dCoordinates}</dt>
            <dd className="mt-1 font-mono text-xs text-cyan-200">{coordinate}</dd>
          </div> : null}
        </dl>

        <p className="mt-4 border-t border-white/[.07] pt-3 text-[10px] leading-5 text-zinc-500">{terrain.terrain3dNote}</p>

        <a
          href={region.viewerUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-black text-black hover:bg-zinc-200"
        >
          {terrain.terrain3dExternal}
          <ExternalLink className="size-3.5"/>
        </a>
        <a
          href={region.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/[.05]"
        >
          {terrain.officialSource}
          <ExternalLink className="size-3.5"/>
        </a>
      </aside>

      <div className="relative order-1 min-h-[55vh] bg-black lg:order-2 lg:min-h-0">
        {!frameLoaded ? <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-[#010205]">
          <div className="text-center">
            <div className="mx-auto grid size-11 place-items-center rounded-2xl border border-orange-300/15 bg-orange-300/[.05]">
              <Mountain className="size-5 text-orange-200"/>
            </div>
            <p className="mt-3 text-xs font-bold text-zinc-300">{terrain.terrain3dLoading}</p>
          </div>
        </div> : null}

        <iframe
          key={region.viewerUrl}
          src={region.viewerUrl}
          title={`${terrain.terrain3dTitle} · ${regionName}`}
          className="absolute inset-0 size-full border-0 bg-black"
          referrerPolicy="no-referrer"
          allow="fullscreen"
          allowFullScreen
          onLoad={() => setLoadedUrl(region.viewerUrl)}
        />

        <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 flex items-end justify-between gap-3">
          <div className="max-w-[26rem] rounded-xl border border-white/10 bg-black/75 px-3 py-2 backdrop-blur-xl">
            <p className="text-[9px] font-black uppercase tracking-[.12em] text-orange-200/75">{providerName(region)}</p>
            <p className="mt-1 text-[10px] leading-4 text-zinc-400">{terrain.terrain3dFrameHint}</p>
          </div>
          <a
            href={region.viewerUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={terrain.terrain3dExternal}
            className="pointer-events-auto grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/75 text-zinc-200 backdrop-blur-xl hover:bg-white/10"
          >
            <Maximize2 className="size-4"/>
          </a>
        </div>
      </div>
    </div>
  </section>
}
