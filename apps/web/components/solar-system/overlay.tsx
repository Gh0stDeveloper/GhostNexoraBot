'use client'

import { useEffect, useState } from 'react'
import {
  Crosshair,
  Eye,
  EyeOff,
  Gauge,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Spline,
} from 'lucide-react'
import { AU_KM, BODY_BY_ID, NAV_BODIES, type BodyDef } from '../../lib/solar-system/bodies'
import { dateFromSimDays, distanceAu } from '../../lib/solar-system/kepler'
import {
  formatDate,
  formatDays,
  formatNumber,
  formatSci,
  formatSpeed,
  yearDurationLabel,
} from '../../lib/solar-system/format'
import { resetToNow, runtime } from '../../lib/solar-system/runtime'
import { SPEED_MAX, SPEED_MIN, useSolar } from '../../lib/solar-system/store'
import { solarBodyCopy, solarSystemCopy, type SolarSystemLocale } from '../../lib/solar-system-i18n'

const SPEED_VALUES = [1, 7, 30, 365, 3652] as const

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function useSimDays(hz = 8): number {
  const [days, setDays] = useState(() => runtime.days)
  useEffect(() => {
    const id = window.setInterval(() => setDays(runtime.days), 1000 / hz)
    return () => window.clearInterval(id)
  }, [hz])
  return days
}

function speedToSlider(speed: number): number {
  const a = Math.log10(SPEED_MIN)
  const b = Math.log10(SPEED_MAX)
  return ((Math.log10(speed) - a) / (b - a)) * 100
}

function sliderToSpeed(value: number): number {
  const a = Math.log10(SPEED_MIN)
  const b = Math.log10(SPEED_MAX)
  return 10 ** (a + (value / 100) * (b - a))
}

export function SolarOverlay({ locale }: { locale: SolarSystemLocale }) {
  const t = solarSystemCopy[locale]
  const bodyCopy = solarBodyCopy[locale]
  const paused = useSolar((state) => state.paused)
  const speed = useSolar((state) => state.speed)
  const selectedId = useSolar((state) => state.selectedId)
  const showLabels = useSolar((state) => state.showLabels)
  const showOrbits = useSolar((state) => state.showOrbits)
  const showTrails = useSolar((state) => state.showTrails)
  const showGalacticMotion = useSolar((state) => state.showGalacticMotion)
  const galacticSpeed = useSolar((state) => state.galacticSpeed)
  const days = useSimDays()
  const date = dateFromSimDays(days)
  const selected = selectedId ? BODY_BY_ID[selectedId] : null

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const state = useSolar.getState()
      if (event.code === 'Space') {
        event.preventDefault()
        state.togglePaused()
      } else if (event.code === 'Escape') {
        state.select(null)
      } else if (event.key === '0') {
        state.select('sun')
      } else if (event.key >= '1' && event.key <= '8') {
        const planet = NAV_BODIES[Number(event.key)]
        if (planet) state.select(planet.id)
      } else if (event.key === '+' || event.key === '=') {
        state.setSpeed(Math.min(SPEED_MAX, state.speed * 1.6))
      } else if (event.key === '-' || event.key === '_') {
        state.setSpeed(Math.max(SPEED_MIN, state.speed / 1.6))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 z-20 text-white">
      <header className="pointer-events-auto absolute left-3 right-3 top-3 flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between md:left-5 md:right-5 md:top-5">
        <div className="flex flex-col gap-2">
          <div className="max-w-[16rem] rounded-2xl border border-white/10 bg-black/60 px-4 py-3 shadow-2xl backdrop-blur-xl md:max-w-xs">
            <p className="text-xl font-black tracking-[-.03em] text-white md:text-2xl">{t.title}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[.12em] text-zinc-400">{t.hud.tagline}</p>
          </div>

          <div className="hidden gap-2 md:flex">
            <Toggle pressed={showOrbits} label={t.hud.orbits} onClick={() => useSolar.getState().setShowOrbits(!showOrbits)}>
              <Spline className="size-4"/>
            </Toggle>
            <Toggle pressed={showTrails} label={t.hud.trails} onClick={() => useSolar.getState().setShowTrails(!showTrails)}>
              <Sparkles className="size-4"/>
            </Toggle>
            <Toggle pressed={showLabels} label={t.hud.labels} onClick={() => useSolar.getState().setShowLabels(!showLabels)}>
              {showLabels ? <Eye className="size-4"/> : <EyeOff className="size-4"/>}
            </Toggle>
            <Toggle pressed={selectedId === null} label={t.hud.overview} onClick={() => useSolar.getState().select(null)}>
              <Crosshair className="size-4"/>
            </Toggle>
            <Toggle pressed={showGalacticMotion} label={t.hud.galacticMotion} onClick={() => useSolar.getState().setShowGalacticMotion(!showGalacticMotion)}>
              <Orbit className="size-4"/>
            </Toggle>
          </div>
        </div>

        <Transport locale={locale} paused={paused} speed={speed} date={date} galacticSpeed={galacticSpeed} showGalacticMotion={showGalacticMotion}/>
      </header>

      <InfoPanel locale={locale} body={selected} days={days}/>

      <nav className="pointer-events-auto absolute bottom-3 left-0 right-0 px-3 md:bottom-5 md:px-5">
        <div className="mb-2 flex justify-center gap-2 md:hidden">
          <Toggle pressed={showOrbits} label={t.hud.orbits} onClick={() => useSolar.getState().setShowOrbits(!showOrbits)}>
            <Spline className="size-4"/>
          </Toggle>
          <Toggle pressed={showTrails} label={t.hud.trails} onClick={() => useSolar.getState().setShowTrails(!showTrails)}>
            <Sparkles className="size-4"/>
          </Toggle>
          <Toggle pressed={showLabels} label={t.hud.labels} onClick={() => useSolar.getState().setShowLabels(!showLabels)}>
            {showLabels ? <Eye className="size-4"/> : <EyeOff className="size-4"/>}
          </Toggle>
          <Toggle pressed={showGalacticMotion} label={t.hud.galacticMotion} onClick={() => useSolar.getState().setShowGalacticMotion(!showGalacticMotion)}>
            <Orbit className="size-4"/>
          </Toggle>
        </div>

        <div className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto rounded-2xl border border-white/8 bg-black/50 p-2 shadow-2xl backdrop-blur-xl [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV_BODIES.map((body) => (
            <button
              key={body.id}
              type="button"
              onClick={() => useSolar.getState().select(selectedId === body.id ? null : body.id)}
              className={cx(
                'flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-bold transition',
                selectedId === body.id
                  ? 'border-white/20 bg-white text-black'
                  : 'border-white/7 bg-white/[.035] text-zinc-300 hover:border-white/15 hover:bg-white/[.07] hover:text-white',
              )}
            >
              <span className="size-2 rounded-full shadow-[0_0_10px_currentColor]" style={{ background: body.color }} aria-hidden/>
              {bodyCopy[body.id].name}
            </button>
          ))}
        </div>
        <p className="mx-auto mt-2 hidden max-w-5xl px-1 text-[10px] font-semibold uppercase tracking-[.1em] text-zinc-600 md:block">{t.hud.shortcuts}</p>
      </nav>
    </div>
  )
}

function Toggle({
  pressed,
  label,
  onClick,
  children,
}: {
  pressed: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={cx(
        'grid size-10 place-items-center rounded-xl border shadow-lg backdrop-blur-xl transition',
        pressed
          ? 'border-cyan-300/25 bg-cyan-300/[.11] text-cyan-100'
          : 'border-white/8 bg-black/55 text-zinc-500 hover:text-white',
      )}
    >
      {children}
    </button>
  )
}

function Transport({
  locale,
  paused,
  speed,
  date,
  galacticSpeed,
  showGalacticMotion,
}: {
  locale: SolarSystemLocale
  paused: boolean
  speed: number
  date: Date
  galacticSpeed: number
  showGalacticMotion: boolean
}) {
  const t = solarSystemCopy[locale]
  return (
    <div className="rounded-2xl border border-white/10 bg-black/60 px-3 py-3 shadow-2xl backdrop-blur-xl sm:min-w-[19rem]">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={paused ? t.hud.resume : t.hud.pause}
          onClick={() => useSolar.getState().togglePaused()}
          className="grid size-10 place-items-center rounded-xl bg-white text-black transition active:scale-95"
        >
          {paused ? <Play className="size-4"/> : <Pause className="size-4"/>}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-zinc-500">{t.hud.simulatedEpoch}</p>
          <p className="truncate text-sm font-bold tabular-nums text-white">{formatDate(date, locale)}</p>
        </div>
        <button type="button" aria-label={t.hud.today} title={t.hud.today} onClick={() => resetToNow()} className="grid size-10 place-items-center rounded-xl text-zinc-400 hover:bg-white/5 hover:text-white">
          <RotateCcw className="size-4"/>
        </button>
      </div>

      <label className="mt-3 block">
        <span className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[.1em] text-zinc-500">
          <span>{t.hud.speed}</span>
          <span className="font-mono text-cyan-200">{formatSpeed(speed, locale)}</span>
        </span>
        <input
          aria-label={t.hud.speed}
          type="range"
          min={0}
          max={100}
          step={0.4}
          value={speedToSlider(speed)}
          onChange={(event) => useSolar.getState().setSpeed(sliderToSpeed(Number(event.target.value)))}
          className="mt-2 w-full accent-cyan-400"
        />
      </label>

      <div className="mt-1 flex items-baseline justify-between gap-2 text-[10px] text-zinc-600">
        <span>{yearDurationLabel(speed, locale)}</span>
        <Gauge className="size-3.5"/>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {SPEED_VALUES.map((value, index) => (
          <button
            key={value}
            type="button"
            onClick={() => useSolar.getState().setSpeed(value)}
            className={cx(
              'h-7 rounded-full px-2.5 text-[10px] font-bold transition',
              Math.abs(speed - value) / value < 0.08 ? 'bg-white text-black' : 'bg-white/[.035] text-zinc-500 hover:text-white',
            )}
          >
            {t.hud.speedPresets[index]}
          </button>
        ))}
      </div>

      <label className={cx('mt-3 block border-t border-white/7 pt-3', !showGalacticMotion && 'opacity-45')}>
        <span className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[.1em] text-zinc-500">
          <span>{t.hud.galacticScale}</span>
          <span className="font-mono text-violet-200">{galacticSpeed.toFixed(1)}×</span>
        </span>
        <input
          aria-label={t.hud.galacticScale}
          type="range"
          min={0.1}
          max={3}
          step={0.1}
          value={galacticSpeed}
          disabled={!showGalacticMotion}
          onChange={(event) => useSolar.getState().setGalacticSpeed(Number(event.target.value))}
          className="mt-2 w-full accent-violet-400"
        />
        <span className="mt-1 block text-[9px] leading-4 text-zinc-600">{t.hud.visualScale}</span>
      </label>
    </div>
  )
}

function localizedTemperature(value: string, locale: SolarSystemLocale) {
  if (locale === 'es') return value
  return value
    .replace(' a ', ' to ')
    .replace('(media)', '(mean)')
    .replace('(superficie)', '(surface)')
    .replace('(nubes)', '(cloud tops)')
    .replace('(fotosfera)', '(photosphere)')
}

function bodyStats(body: BodyDef, days: number, locale: SolarSystemLocale): { key: string; value: string }[] {
  const labels = solarSystemCopy[locale].bodyStats
  const bodyText = solarBodyCopy[locale][body.id]
  const rows: { key: string; value: string }[] = [
    { key: labels.class, value: bodyText.typeLabel },
    { key: labels.radius, value: `${formatNumber(body.radiusKm, locale, 0)} km` },
    { key: labels.mass, value: formatSci(body.massCoeff, body.massExp, 'kg', locale) },
    { key: labels.gravity, value: `${formatNumber(body.gravity, locale, 2)} m/s²` },
    { key: labels.rotation, value: formatDays(Math.abs(body.rotationDays), locale) },
    { key: labels.obliquity, value: `${formatNumber(body.obliquity, locale, 2)}°` },
    { key: labels.temperature, value: localizedTemperature(body.temp, locale) },
  ]

  if (body.orbit) {
    const liveAu = distanceAu(body.orbit, days)
    rows.splice(
      1,
      0,
      { key: labels.distance, value: `${formatNumber(liveAu, locale, 3)} AU · ${formatNumber((liveAu * AU_KM) / 1e6, locale, 1)} M km` },
      { key: labels.semimajor, value: `${formatNumber(body.orbit.a, locale, 3)} AU` },
      { key: labels.orbitalPeriod, value: formatDays(body.orbit.periodDays, locale) },
      { key: labels.eccentricity, value: formatNumber(body.orbit.e, locale, 4) },
      { key: labels.inclination, value: `${formatNumber(body.orbit.i, locale, 3)}°` },
    )
  }

  if (body.kind === 'planet') rows.push({ key: labels.moons, value: String(body.moons) })
  return rows
}

function InfoPanel({ locale, body, days }: { locale: SolarSystemLocale; body: BodyDef | null; days: number }) {
  if (!body) return null
  const copy = solarBodyCopy[locale][body.id]
  const stats = bodyStats(body, days, locale)

  return (
    <aside className="pointer-events-auto absolute bottom-28 left-3 right-3 max-h-[39vh] overflow-auto md:bottom-auto md:left-auto md:right-5 md:top-36 md:max-h-[calc(100dvh-13rem)] md:w-[21rem]">
      <div className="rounded-2xl border border-white/10 bg-black/65 px-4 py-4 shadow-2xl backdrop-blur-xl">
        <p className="text-[10px] font-black uppercase tracking-[.16em] text-zinc-500">{body.latin}</p>
        <div className="mt-1 flex items-center gap-2">
          <h2 className="text-2xl font-black tracking-tight text-white">{copy.name}</h2>
          <span className="size-2 rounded-full shadow-[0_0_14px_currentColor]" style={{ background: body.color }}/>
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-400">{copy.blurb}</p>
        <dl className="mt-4 space-y-2">
          {stats.map((row) => (
            <div key={row.key} className="flex items-baseline justify-between gap-3 border-t border-white/7 pt-2">
              <dt className="text-[10px] font-semibold uppercase tracking-[.08em] text-zinc-600">{row.key}</dt>
              <dd className="text-right text-xs font-bold tabular-nums text-zinc-200">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  )
}
