'use client'

import {
  ArrowLeft,
  ExternalLink,
  LocateFixed,
  Mountain,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react'
import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  heliosSurfaceDataset,
  type HeliosSurfaceId,
  type HeliosSurfaceProjection,
} from '../lib/nexora-helios-surface-data'
import { nexoraHeliosCopy, type NexoraHeliosLocale } from '../lib/nexora-helios-i18n'
import { hasHeliosTerrainRegions } from '../lib/nexora-helios-terrain-data'
import { NexoraHeliosTerrainExplorer } from './nexora-helios-terrain-explorer'

const MIN_ZOOM = 1
const MAX_ZOOM = 6

type Point = { x: number; y: number }

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function projectionLabel(
  projection: HeliosSurfaceProjection,
  copy: typeof nexoraHeliosCopy.es.surface | typeof nexoraHeliosCopy.en.surface,
) {
  switch (projection) {
    case 'simple-cylindrical':
      return copy.projectionSimpleCylindrical
    case 'cylindrical':
      return copy.projectionCylindrical
    case 'global-radar-view':
      return copy.projectionGlobalRadarView
    case 'global-topography-view':
      return copy.projectionGlobalTopographyView
    case 'global-base-map':
      return copy.projectionGlobalBaseMap
  }
}

function formatCoordinate(value: number, positive: string, negative: string) {
  const absolute = Math.abs(value)
  const suffix = value >= 0 ? positive : negative
  return `${absolute.toFixed(2)}° ${suffix}`
}

export function NexoraHeliosSurfaceExplorer({
  locale,
  id,
  onClose,
}: {
  locale: NexoraHeliosLocale
  id: HeliosSurfaceId
  onClose: () => void
}) {
  const copy = nexoraHeliosCopy[locale]
  const surface = copy.surface
  const body = copy.bodies[id]
  const dataset = heliosSurfaceDataset(id)
  const viewportRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const dragPoint = useRef<Point | null>(null)
  const pinchDistance = useRef<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const [imageError, setImageError] = useState(false)
  const [terrainOpen, setTerrainOpen] = useState(false)
  const terrainAvailable = hasHeliosTerrainRegions(id)

  const clampOffset = (next: Point, scale = zoom) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    const image = imageRef.current
    if (!rect || !image || scale <= 1) return { x: 0, y: 0 }
    const maxX = Math.max(0, (image.offsetWidth * scale - rect.width) / 2)
    const maxY = Math.max(0, (image.offsetHeight * scale - rect.height) / 2)
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    }
  }

  const applyZoom = (nextZoom: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom))
    setZoom(clamped)
    setOffset((current) => clampOffset(current, clamped))
  }

  const resetView = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = { x: event.clientX, y: event.clientY }
    pointers.current.set(event.pointerId, point)
    if (pointers.current.size === 1) {
      dragPoint.current = point
      pinchDistance.current = null
    } else if (pointers.current.size === 2) {
      const [first, second] = Array.from(pointers.current.values())
      pinchDistance.current = distance(first, second)
      dragPoint.current = null
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    const point = { x: event.clientX, y: event.clientY }
    pointers.current.set(event.pointerId, point)

    if (pointers.current.size >= 2) {
      const [first, second] = Array.from(pointers.current.values())
      const nextDistance = distance(first, second)
      if (pinchDistance.current && pinchDistance.current > 0) {
        const factor = nextDistance / pinchDistance.current
        applyZoom(zoom * factor)
      }
      pinchDistance.current = nextDistance
      return
    }

    const previous = dragPoint.current
    dragPoint.current = point
    if (!previous || zoom <= 1) return
    setOffset((current) => clampOffset({
      x: current.x + point.x - previous.x,
      y: current.y + point.y - previous.y,
    }))
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size === 1) {
      dragPoint.current = Array.from(pointers.current.values())[0] ?? null
      pinchDistance.current = null
    } else if (pointers.current.size === 0) {
      dragPoint.current = null
      pinchDistance.current = null
    }
  }

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const factor = Math.exp(-event.deltaY * 0.0014)
    applyZoom(zoom * factor)
  }

  const centerCoordinate = () => {
    if (!dataset.coordinateMap) return null
    const image = imageRef.current
    if (!image || !image.offsetWidth || !image.offsetHeight) return { latitude: 0, longitude: 0 }
    const sourceX = image.offsetWidth / 2 - offset.x / zoom
    const sourceY = image.offsetHeight / 2 - offset.y / zoom
    const longitude = Math.max(-180, Math.min(180, sourceX / image.offsetWidth * 360 - 180))
    const latitude = Math.max(-90, Math.min(90, 90 - sourceY / image.offsetHeight * 180))
    return { latitude, longitude }
  }

  const coordinate = centerCoordinate()
  const rows = [
    [surface.dataset, dataset.dataset],
    [surface.mission, dataset.mission],
    [surface.instrument, dataset.instrument],
    [surface.provider, dataset.provider],
    [surface.coverage, surface.coverageGlobal],
    [surface.projection, projectionLabel(dataset.projection, surface)],
    [surface.resolution, dataset.resolution],
    ...(dataset.verticalRange ? [[surface.verticalRange, dataset.verticalRange]] : []),
    ...(dataset.datum ? [[surface.datum, dataset.datum]] : []),
  ]

  return <section
    className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-[#02040a]/98 text-white backdrop-blur-2xl"
    aria-label={surface.title}
  >
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/50 px-3 py-3 backdrop-blur-xl md:px-5">
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[.18em] text-cyan-300/75">{surface.eyebrow}</p>
        <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-lg font-black tracking-tight md:text-xl">{surface.title}</h2>
          <span className="truncate text-xs font-bold text-zinc-400">{body.name}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[.05] px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/[.09]"
      >
        <ArrowLeft className="size-4"/>
        <span className="hidden sm:inline">{surface.backPlanet}</span>
      </button>
    </header>

    <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="relative flex min-h-0 flex-col bg-black">
        <div
          ref={viewportRef}
          className="relative min-h-0 flex-1 touch-none overflow-hidden bg-[#010204] select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onWheel={handleWheel}
        >
          {!imageError ? <div
            className="absolute inset-0 flex items-center justify-center will-change-transform"
            style={{ transform: `translate3d(${offset.x}px,${offset.y}px,0) scale(${zoom})` }}
          >
            <img
              ref={imageRef}
              src={dataset.imageUrl}
              alt={`${body.name} · ${dataset.dataset}`}
              draggable={false}
              referrerPolicy="no-referrer"
              onError={() => setImageError(true)}
              className="max-h-full max-w-full object-contain"
            />
          </div> : <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div className="max-w-md">
              <p className="text-sm font-bold text-zinc-200">{dataset.dataset}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-500">{surface.previewNote}</p>
            </div>
          </div>}

          {dataset.coordinateMap ? <div className="pointer-events-none absolute left-1/2 top-1/2">
            <span className="absolute -left-3 top-0 h-px w-6 bg-cyan-200/80"/>
            <span className="absolute left-0 -top-3 h-6 w-px bg-cyan-200/80"/>
            <span className="absolute -left-1 -top-1 size-2 rounded-full border border-cyan-100 bg-cyan-300/30 shadow-[0_0_12px_rgba(103,232,249,.5)]"/>
          </div> : null}

          <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
            <div className="rounded-xl border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-xl">
              <p className="text-[9px] font-black uppercase tracking-[.13em] text-cyan-300/70">{surface.realData}</p>
              <p className="mt-0.5 max-w-[19rem] text-[10px] leading-4 text-zinc-400">{surface.dragHint}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/70 px-3 py-2 font-mono text-[10px] text-zinc-300 backdrop-blur-xl">
              {zoom.toFixed(2)}×
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-[#05070c] px-3 py-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={surface.zoomOut}
              disabled={zoom <= MIN_ZOOM}
              onClick={() => applyZoom(zoom / 1.35)}
              className="grid size-9 place-items-center rounded-xl border border-white/10 text-zinc-300 disabled:opacity-30"
            >
              <Minus className="size-4"/>
            </button>
            <button
              type="button"
              aria-label={surface.zoomIn}
              disabled={zoom >= MAX_ZOOM}
              onClick={() => applyZoom(zoom * 1.35)}
              className="grid size-9 place-items-center rounded-xl border border-white/10 text-zinc-300 disabled:opacity-30"
            >
              <Plus className="size-4"/>
            </button>
            <button
              type="button"
              aria-label={surface.resetView}
              onClick={resetView}
              className="grid size-9 place-items-center rounded-xl border border-white/10 text-zinc-300"
            >
              <RotateCcw className="size-4"/>
            </button>
          </div>

          {coordinate ? <div className="flex min-w-0 items-center gap-2 text-[10px] text-zinc-400">
            <LocateFixed className="size-3.5 shrink-0 text-cyan-300"/>
            <span className="truncate font-mono">
              {formatCoordinate(coordinate.latitude, 'N', 'S')} · {formatCoordinate(coordinate.longitude, 'E', 'W')}
            </span>
          </div> : <p className="max-w-[60%] text-right text-[9px] leading-4 text-zinc-600">{surface.coordinateUnavailable}</p>}
        </div>
      </div>

      <aside className="min-h-0 overflow-auto border-t border-white/10 bg-[#060911] p-4 md:border-l md:border-t-0">
        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[.05] p-3">
          <p className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-300/70">{surface.realData}</p>
          <p className="mt-1 text-sm font-black text-white">{dataset.dataset}</p>
          <p className="mt-2 text-[10px] leading-5 text-zinc-500">{surface.previewNote}</p>
        </div>

        <dl className="mt-4 space-y-2">
          {rows.map(([label, value]) => <div key={label} className="border-t border-white/[.07] pt-2">
            <dt className="text-[9px] font-bold uppercase tracking-[.1em] text-zinc-600">{label}</dt>
            <dd className="mt-1 text-xs leading-5 text-zinc-300">{value}</dd>
          </div>)}
        </dl>

        <div className="mt-4 border-t border-white/[.07] pt-3">
          <p className="text-[9px] font-bold uppercase tracking-[.1em] text-zinc-600">{surface.credit}</p>
          <p className="mt-1 text-[10px] leading-5 text-zinc-400">{dataset.credit}</p>
        </div>

        {terrainAvailable ? <button
          type="button"
          onClick={() => setTerrainOpen(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-100 px-3 py-2.5 text-xs font-black text-black hover:bg-white"
        >
          <Mountain className="size-4"/>
          {surface.openTerrain3d}
        </button> : null}

        <a
          href={dataset.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className={terrainAvailable
            ? 'mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-zinc-200 hover:bg-white/[.05]'
            : 'mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-black text-black hover:bg-zinc-200'}
        >
          {surface.officialSource}
          <ExternalLink className="size-3.5"/>
        </a>
      </aside>
    </div>

    {terrainOpen ? <NexoraHeliosTerrainExplorer
      locale={locale}
      id={id}
      onClose={() => setTerrainOpen(false)}
    /> : null}
  </section>
}
