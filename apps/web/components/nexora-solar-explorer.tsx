'use client'

import {
  CircleGauge,
  Focus,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Route,
  Sparkles,
  Tags,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { NexoraSolarLocale } from '../lib/nexora-solar-i18n'
import { nexoraSolarCopy } from '../lib/nexora-solar-i18n'

type Vec3 = [number, number, number]
type PlanetId = 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune'

type PlanetSpec = {
  id: PlanetId
  name: { es: string; en: string }
  type: { es: string; en: string }
  a: number
  e: number
  i: number
  Omega: number
  w: number
  M0: number
  periodDays: number
  rotationDays: number
  visualRadius: number
  radiusKm: number
  moons: number
  temp: { es: string; en: string }
  base: string
  light: string
  dark: string
  atmosphere?: string
  rings?: { inner: number; outer: number }
}

const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0)
const AU_SCALE = 24
const DIST_EXP = 0.52
const TAU = Math.PI * 2

const PLANETS: PlanetSpec[] = [
  {
    id: 'mercury', name: { es: 'Mercurio', en: 'Mercury' }, type: { es: 'Planeta telúrico', en: 'Terrestrial planet' },
    a: 0.38709927, e: 0.20563593, i: 7.00497902, Omega: 48.33076593, w: 29.12703035, M0: 174.79252722, periodDays: 87.969,
    rotationDays: 58.646, visualRadius: 0.42, radiusKm: 2439.7, moons: 0,
    temp: { es: '−173 a 427 °C', en: '−173 to 427 °C' }, base: '#9f958d', light: '#d8cec3', dark: '#4e4844',
  },
  {
    id: 'venus', name: { es: 'Venus', en: 'Venus' }, type: { es: 'Planeta telúrico', en: 'Terrestrial planet' },
    a: 0.72333566, e: 0.00677672, i: 3.39467605, Omega: 76.67984255, w: 54.92262463, M0: 50.37663232, periodDays: 224.701,
    rotationDays: -243.025, visualRadius: 0.78, radiusKm: 6051.8, moons: 0,
    temp: { es: '464 °C', en: '464 °C' }, base: '#d9a95f', light: '#ffe3a4', dark: '#85562f', atmosphere: '#ffd28a',
  },
  {
    id: 'earth', name: { es: 'Tierra', en: 'Earth' }, type: { es: 'Planeta telúrico', en: 'Terrestrial planet' },
    a: 1.00000261, e: 0.01671123, i: 0.00001531, Omega: 0, w: 102.93768193, M0: 357.52688973, periodDays: 365.256,
    rotationDays: 0.997269, visualRadius: 0.82, radiusKm: 6371, moons: 1,
    temp: { es: '15 °C media', en: '15 °C average' }, base: '#1b69c7', light: '#65c8ff', dark: '#08275c', atmosphere: '#78c7ff',
  },
  {
    id: 'mars', name: { es: 'Marte', en: 'Mars' }, type: { es: 'Planeta telúrico', en: 'Terrestrial planet' },
    a: 1.52371034, e: 0.0933941, i: 1.84969142, Omega: 49.55953891, w: 286.4968315, M0: 19.39019754, periodDays: 686.98,
    rotationDays: 1.025957, visualRadius: 0.52, radiusKm: 3389.5, moons: 2,
    temp: { es: '−63 °C media', en: '−63 °C average' }, base: '#c45532', light: '#f0a166', dark: '#672718', atmosphere: '#e78d61',
  },
  {
    id: 'jupiter', name: { es: 'Júpiter', en: 'Jupiter' }, type: { es: 'Gigante gaseoso', en: 'Gas giant' },
    a: 5.202887, e: 0.04838624, i: 1.30439695, Omega: 100.47390909, w: 274.25457074, M0: 19.66796068, periodDays: 4332.589,
    rotationDays: 0.41354, visualRadius: 2.32, radiusKm: 69911, moons: 95,
    temp: { es: '−108 °C en nubes', en: '−108 °C at cloud tops' }, base: '#c99a6d', light: '#f3d6aa', dark: '#76503c', atmosphere: '#d8af82',
  },
  {
    id: 'saturn', name: { es: 'Saturno', en: 'Saturn' }, type: { es: 'Gigante gaseoso', en: 'Gas giant' },
    a: 9.53667594, e: 0.05386179, i: 2.48599187, Omega: 113.66242448, w: 338.93645383, M0: 317.35536592, periodDays: 10759.22,
    rotationDays: 0.44401, visualRadius: 2.02, radiusKm: 58232, moons: 146,
    temp: { es: '−139 °C en nubes', en: '−139 °C at cloud tops' }, base: '#d8bd7e', light: '#fff0b8', dark: '#826e45', atmosphere: '#ead9a8', rings: { inner: 1.34, outer: 2.45 },
  },
  {
    id: 'uranus', name: { es: 'Urano', en: 'Uranus' }, type: { es: 'Gigante de hielo', en: 'Ice giant' },
    a: 19.18916464, e: 0.04725744, i: 0.77263783, Omega: 74.01692503, w: 96.93735127, M0: 142.28382821, periodDays: 30685.4,
    rotationDays: -0.71833, visualRadius: 1.22, radiusKm: 25362, moons: 28,
    temp: { es: '−195 °C', en: '−195 °C' }, base: '#69c8ce', light: '#c5fbff', dark: '#2d727a', atmosphere: '#a9eef1',
  },
  {
    id: 'neptune', name: { es: 'Neptuno', en: 'Neptune' }, type: { es: 'Gigante de hielo', en: 'Ice giant' },
    a: 30.06992276, e: 0.00859048, i: 1.77004347, Omega: 131.78422574, w: 273.18698507, M0: 259.9087595, periodDays: 60189,
    rotationDays: 0.67125, visualRadius: 1.18, radiusKm: 24622, moons: 16,
    temp: { es: '−201 °C', en: '−201 °C' }, base: '#245ad0', light: '#76a7ff', dark: '#10255f', atmosphere: '#5e8cf0',
  },
]

const BY_ID = Object.fromEntries(PLANETS.map((planet) => [planet.id, planet])) as Record<PlanetId, PlanetSpec>

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((char) => char + char).join('') : value
  const parsed = Number.parseInt(full, 16)
  return `rgba(${(parsed >> 16) & 255}, ${(parsed >> 8) & 255}, ${parsed & 255}, ${alpha})`
}

function rotateY([x, y, z]: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [x * c - z * s, y, x * s + z * c]
}

function rotateX([x, y, z]: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [x, y * c - z * s, y * s + z * c]
}

function rotateZ([x, y, z]: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [x * c - y * s, x * s + y * c, z]
}

function mod2pi(angle: number) {
  const value = angle % TAU
  return value < 0 ? value + TAU : value
}

function solveKepler(mean: number, eccentricity: number) {
  const m = mod2pi(mean)
  let eccentric = eccentricity < 0.8 ? m : Math.PI
  for (let index = 0; index < 12; index += 1) {
    const delta = (eccentric - eccentricity * Math.sin(eccentric) - m) / (1 - eccentricity * Math.cos(eccentric))
    eccentric -= delta
    if (Math.abs(delta) < 1e-9) break
  }
  return eccentric
}

function visualSemiMajor(aAu: number) {
  return AU_SCALE * Math.pow(Math.max(aAu, 1e-6), DIST_EXP)
}

function positionFor(planet: PlanetSpec, days: number): Vec3 {
  const mean = (planet.M0 * Math.PI) / 180 + (TAU / planet.periodDays) * days
  const eccentric = solveKepler(mean, planet.e)
  const beta = Math.sqrt((1 + planet.e) / Math.max(1 - planet.e, 1e-12))
  const nu = 2 * Math.atan2(beta * Math.sin(eccentric / 2), Math.cos(eccentric / 2))
  const a = visualSemiMajor(planet.a)
  const radius = a * (1 - planet.e * Math.cos(eccentric))
  const O = (planet.Omega * Math.PI) / 180
  const inc = (planet.i * Math.PI) / 180
  const arg = (planet.w * Math.PI) / 180 + nu
  const x = radius * (Math.cos(O) * Math.cos(arg) - Math.sin(O) * Math.sin(arg) * Math.cos(inc))
  const y = radius * Math.sin(arg) * Math.sin(inc)
  const z = -radius * (Math.sin(O) * Math.cos(arg) + Math.cos(O) * Math.sin(arg) * Math.cos(inc))
  return [x, y, z]
}

function orbitPoint(planet: PlanetSpec, fraction: number): Vec3 {
  const nu = fraction * TAU
  const a = visualSemiMajor(planet.a)
  const radius = (a * (1 - planet.e * planet.e)) / (1 + planet.e * Math.cos(nu))
  const O = (planet.Omega * Math.PI) / 180
  const inc = (planet.i * Math.PI) / 180
  const arg = (planet.w * Math.PI) / 180 + nu
  const x = radius * (Math.cos(O) * Math.cos(arg) - Math.sin(O) * Math.sin(arg) * Math.cos(inc))
  const y = radius * Math.sin(arg) * Math.sin(inc)
  const z = -radius * (Math.sin(O) * Math.cos(arg) + Math.cos(O) * Math.sin(arg) * Math.cos(inc))
  return [x, y, z]
}

type Projected = { x: number; y: number; depth: number; factor: number; visible: boolean }

function projectPoint(point: Vec3, width: number, height: number, yaw: number, pitch: number, zoom: number): Projected {
  let rotated = rotateY(point, yaw)
  rotated = rotateX(rotated, pitch)
  const cameraDistance = 225 / zoom
  const depth = cameraDistance + rotated[2]
  const focal = Math.min(width, height) * 0.92
  const factor = focal / Math.max(30, depth)
  return {
    x: width / 2 + rotated[0] * factor,
    y: height / 2 - rotated[1] * factor,
    depth,
    factor,
    visible: depth > 12,
  }
}

function seededStars(count: number) {
  let seed = 0x51f15e
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  return Array.from({ length: count }, () => ({
    x: rand(),
    y: rand(),
    depth: 0.25 + rand() * 1.2,
    size: 0.45 + rand() * 1.7,
    alpha: 0.25 + rand() * 0.7,
    warmth: rand(),
  }))
}

type ScreenPlanet = { id: PlanetId; x: number; y: number; radius: number; depth: number }

function drawPlanetTexture(ctx: CanvasRenderingContext2D, planet: PlanetSpec, x: number, y: number, radius: number, spin: number) {
  const sphere = ctx.createRadialGradient(x - radius * 0.34, y - radius * 0.35, radius * 0.08, x, y, radius)
  sphere.addColorStop(0, planet.light)
  sphere.addColorStop(0.44, planet.base)
  sphere.addColorStop(1, planet.dark)
  ctx.fillStyle = sphere
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, TAU)
  ctx.fill()

  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, radius * 0.98, 0, TAU)
  ctx.clip()

  if (planet.id === 'earth') {
    ctx.fillStyle = 'rgba(65, 157, 82, .82)'
    for (let index = 0; index < 5; index += 1) {
      const angle = spin * 0.5 + index * 1.37
      ctx.beginPath()
      ctx.ellipse(x + Math.cos(angle) * radius * 0.42, y + Math.sin(angle * 1.7) * radius * 0.24, radius * 0.28, radius * 0.13, angle * 0.3, 0, TAU)
      ctx.fill()
    }
    ctx.strokeStyle = 'rgba(255,255,255,.68)'
    ctx.lineWidth = Math.max(1, radius * 0.07)
    for (let index = 0; index < 3; index += 1) {
      ctx.beginPath()
      ctx.arc(x + Math.sin(spin + index) * radius * 0.3, y - radius * 0.15 + index * radius * 0.12, radius * 0.42, Math.PI * 0.18, Math.PI * 0.84)
      ctx.stroke()
    }
  } else if (planet.id === 'jupiter' || planet.id === 'saturn') {
    const bands = planet.id === 'jupiter'
      ? ['rgba(248,224,188,.42)', 'rgba(126,78,52,.42)', 'rgba(244,207,158,.34)', 'rgba(137,86,57,.35)']
      : ['rgba(255,240,195,.35)', 'rgba(133,111,73,.28)', 'rgba(246,222,167,.25)']
    bands.forEach((color, index) => {
      ctx.fillStyle = color
      const bandHeight = Math.max(1.2, radius * 0.12)
      const offset = ((index / bands.length) - 0.42) * radius * 1.5
      ctx.fillRect(x - radius, y + offset, radius * 2, bandHeight)
    })
    if (planet.id === 'jupiter') {
      ctx.fillStyle = 'rgba(175, 72, 49, .72)'
      ctx.beginPath()
      ctx.ellipse(x + radius * 0.34, y + radius * 0.18, radius * 0.22, radius * 0.11, -0.18, 0, TAU)
      ctx.fill()
    }
  } else if (planet.id === 'mars') {
    ctx.fillStyle = 'rgba(88, 38, 25, .34)'
    for (let index = 0; index < 4; index += 1) {
      const angle = spin + index * 1.8
      ctx.beginPath()
      ctx.ellipse(x + Math.cos(angle) * radius * 0.35, y + Math.sin(angle * 1.4) * radius * 0.22, radius * 0.18, radius * 0.09, angle, 0, TAU)
      ctx.fill()
    }
  } else if (planet.id === 'venus') {
    ctx.strokeStyle = 'rgba(255, 241, 196, .38)'
    ctx.lineWidth = Math.max(1, radius * 0.08)
    for (let index = 0; index < 4; index += 1) {
      ctx.beginPath()
      ctx.arc(x, y + (index - 1.5) * radius * 0.25, radius * (0.72 - Math.abs(index - 1.5) * 0.08), 0.2, Math.PI - 0.2)
      ctx.stroke()
    }
  } else if (planet.id === 'neptune') {
    ctx.fillStyle = 'rgba(17, 31, 86, .5)'
    ctx.beginPath()
    ctx.ellipse(x + radius * 0.28, y - radius * 0.12, radius * 0.16, radius * 0.09, -0.2, 0, TAU)
    ctx.fill()
  } else if (planet.id === 'mercury') {
    ctx.fillStyle = 'rgba(53, 48, 45, .35)'
    for (let index = 0; index < 6; index += 1) {
      const angle = index * 2.29 + spin
      ctx.beginPath()
      ctx.arc(x + Math.cos(angle) * radius * 0.5, y + Math.sin(angle * 1.13) * radius * 0.42, Math.max(1, radius * 0.08), 0, TAU)
      ctx.fill()
    }
  }

  ctx.restore()

  if (planet.atmosphere) {
    ctx.strokeStyle = hexToRgba(planet.atmosphere, 0.48)
    ctx.lineWidth = Math.max(1, radius * 0.08)
    ctx.beginPath()
    ctx.arc(x, y, radius * 1.04, 0, TAU)
    ctx.stroke()
  }
}

function drawSaturnRings(ctx: CanvasRenderingContext2D, planet: PlanetSpec, x: number, y: number, radius: number, tilt: number) {
  if (!planet.rings) return
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.18 + tilt * 0.12)
  ctx.scale(1, 0.34)
  const gradient = ctx.createRadialGradient(0, 0, radius * planet.rings.inner, 0, 0, radius * planet.rings.outer)
  gradient.addColorStop(0, 'rgba(255,232,181,0)')
  gradient.addColorStop(0.15, 'rgba(242,219,170,.58)')
  gradient.addColorStop(0.46, 'rgba(186,157,111,.34)')
  gradient.addColorStop(0.58, 'rgba(35,29,23,.16)')
  gradient.addColorStop(0.74, 'rgba(236,213,166,.48)')
  gradient.addColorStop(1, 'rgba(255,238,198,0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(0, 0, radius * planet.rings.outer, 0, TAU)
  ctx.fill()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.arc(0, 0, radius * planet.rings.inner, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function speedFromSlider(value: number) {
  const min = Math.log(0.25)
  const max = Math.log(4000)
  return Math.exp(min + (value / 100) * (max - min))
}

function sliderFromSpeed(speed: number) {
  const min = Math.log(0.25)
  const max = Math.log(4000)
  return ((Math.log(speed) - min) / (max - min)) * 100
}

function formatSpeed(speed: number, locale: NexoraSolarLocale) {
  const value = speed < 10 ? speed.toFixed(1) : Math.round(speed).toString()
  return locale === 'en' ? `${value} days/s` : `${value} días/s`
}

function formatNumber(value: number, locale: NexoraSolarLocale) {
  return value.toLocaleString(locale === 'en' ? 'en-US' : 'es-MX')
}

export function NexoraSolarExplorer({ locale }: { locale: NexoraSolarLocale }) {
  const copy = nexoraSolarCopy[locale]
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number | null>(null)
  const daysRef = useRef((Date.now() - J2000_MS) / 86_400_000)
  const galaxyPhaseRef = useRef(0)
  const screenPlanetsRef = useRef<ScreenPlanet[]>([])
  const dragRef = useRef({ active: false, x: 0, y: 0, moved: 0 })
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(48)
  const [yaw, setYaw] = useState(-0.42)
  const [pitch, setPitch] = useState(-0.28)
  const [zoom, setZoom] = useState(1)
  const [showLabels, setShowLabels] = useState(true)
  const [showOrbits, setShowOrbits] = useState(true)
  const [showTrails, setShowTrails] = useState(true)
  const [galacticMotion, setGalacticMotion] = useState(true)
  const [selectedId, setSelectedId] = useState<PlanetId>('earth')
  const yawRef = useRef(yaw)
  const pitchRef = useRef(pitch)
  const zoomRef = useRef(zoom)
  const speedRef = useRef(speed)
  const stars = useMemo(() => seededStars(620), [])
  const selected = BY_ID[selectedId]

  useEffect(() => { yawRef.current = yaw }, [yaw])
  useEffect(() => { pitchRef.current = pitch }, [pitch])
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { speedRef.current = speed }, [speed])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.floor(rect.width * dpr))
      const height = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
    }

    const render = (now: number) => {
      resize()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = canvas.width / dpr
      const height = canvas.height / dpr
      const delta = lastTimeRef.current === null ? 0 : Math.min((now - lastTimeRef.current) / 1000, 0.08)
      lastTimeRef.current = now
      if (!paused) daysRef.current += delta * speedRef.current
      if (galacticMotion && !paused) galaxyPhaseRef.current += delta * 0.08

      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      const background = context.createRadialGradient(width * 0.5, height * 0.43, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.78)
      background.addColorStop(0, '#0c1734')
      background.addColorStop(0.45, '#050814')
      background.addColorStop(1, '#010205')
      context.fillStyle = background
      context.fillRect(0, 0, width, height)

      context.save()
      context.translate(width * 0.55, height * 0.45)
      context.rotate(-0.22 + Math.sin(galaxyPhaseRef.current * 0.4) * 0.03)
      const milky = context.createLinearGradient(-width * 0.7, 0, width * 0.7, 0)
      milky.addColorStop(0, 'rgba(83, 114, 176, 0)')
      milky.addColorStop(0.35, 'rgba(117, 151, 219, .035)')
      milky.addColorStop(0.5, 'rgba(214, 222, 255, .075)')
      milky.addColorStop(0.65, 'rgba(117, 151, 219, .035)')
      milky.addColorStop(1, 'rgba(83, 114, 176, 0)')
      context.fillStyle = milky
      context.fillRect(-width, -height * 0.09, width * 2, height * 0.18)
      context.restore()

      for (const star of stars) {
        const travel = galacticMotion ? galaxyPhaseRef.current * star.depth * 74 : 0
        const sx = ((star.x * width + travel + yawRef.current * 34 * star.depth) % (width + 20) + (width + 20)) % (width + 20) - 10
        const sy = ((star.y * height + travel * 0.13 - pitchRef.current * 20 * star.depth) % (height + 20) + (height + 20)) % (height + 20) - 10
        const tone = star.warmth > 0.82 ? '255,220,180' : star.warmth < 0.2 ? '170,205,255' : '232,239,255'
        context.fillStyle = `rgba(${tone},${star.alpha})`
        context.beginPath()
        context.arc(sx, sy, star.size, 0, TAU)
        context.fill()
      }

      const galacticYaw = galacticMotion ? galaxyPhaseRef.current * 0.18 : 0
      const galacticTilt = galacticMotion ? Math.sin(galaxyPhaseRef.current * 0.37) * 0.06 : 0
      const systemTransform = (point: Vec3) => rotateZ(rotateY(point, galacticYaw), galacticTilt)

      if (showOrbits) {
        context.lineWidth = 1
        for (const planet of PLANETS) {
          context.strokeStyle = hexToRgba(planet.base, planet.id === selectedId ? 0.52 : 0.2)
          context.beginPath()
          let started = false
          for (let sample = 0; sample <= 120; sample += 1) {
            const point = systemTransform(orbitPoint(planet, sample / 120))
            const projected = projectPoint(point, width, height, yawRef.current, pitchRef.current, zoomRef.current)
            if (!projected.visible) continue
            if (!started) {
              context.moveTo(projected.x, projected.y)
              started = true
            } else {
              context.lineTo(projected.x, projected.y)
            }
          }
          context.stroke()
        }
      }

      if (showTrails) {
        for (const planet of PLANETS) {
          context.lineWidth = planet.id === selectedId ? 1.7 : 1
          for (let sample = 1; sample < 28; sample += 1) {
            const t0 = daysRef.current - planet.periodDays * 0.16 * ((sample - 1) / 27)
            const t1 = daysRef.current - planet.periodDays * 0.16 * (sample / 27)
            const p0 = projectPoint(systemTransform(positionFor(planet, t0)), width, height, yawRef.current, pitchRef.current, zoomRef.current)
            const p1 = projectPoint(systemTransform(positionFor(planet, t1)), width, height, yawRef.current, pitchRef.current, zoomRef.current)
            if (!p0.visible || !p1.visible) continue
            context.strokeStyle = hexToRgba(planet.light, 0.48 * (1 - sample / 30))
            context.beginPath()
            context.moveTo(p0.x, p0.y)
            context.lineTo(p1.x, p1.y)
            context.stroke()
          }
        }
      }

      const sun = projectPoint([0, 0, 0], width, height, yawRef.current, pitchRef.current, zoomRef.current)
      const sunRadius = clamp(2.55 * sun.factor * 5.3, 13, 54)
      const halo = context.createRadialGradient(sun.x, sun.y, sunRadius * 0.15, sun.x, sun.y, sunRadius * 4.6)
      halo.addColorStop(0, 'rgba(255,245,198,.88)')
      halo.addColorStop(0.18, 'rgba(255,183,71,.45)')
      halo.addColorStop(0.52, 'rgba(255,123,34,.12)')
      halo.addColorStop(1, 'rgba(255,92,17,0)')
      context.fillStyle = halo
      context.beginPath()
      context.arc(sun.x, sun.y, sunRadius * 4.6, 0, TAU)
      context.fill()
      const sunFill = context.createRadialGradient(sun.x - sunRadius * 0.32, sun.y - sunRadius * 0.35, sunRadius * 0.12, sun.x, sun.y, sunRadius)
      sunFill.addColorStop(0, '#fff8c8')
      sunFill.addColorStop(0.28, '#ffd86f')
      sunFill.addColorStop(0.67, '#ff9b31')
      sunFill.addColorStop(1, '#d8480f')
      context.fillStyle = sunFill
      context.beginPath()
      context.arc(sun.x, sun.y, sunRadius, 0, TAU)
      context.fill()
      context.strokeStyle = 'rgba(255,220,128,.72)'
      context.lineWidth = 1.2
      for (let flare = 0; flare < 3; flare += 1) {
        context.beginPath()
        context.arc(sun.x, sun.y, sunRadius * (1.08 + flare * 0.12), galaxyPhaseRef.current * (flare + 1), galaxyPhaseRef.current * (flare + 1) + Math.PI * 0.72)
        context.stroke()
      }

      const rendered = PLANETS.map((planet) => {
        const position = systemTransform(positionFor(planet, daysRef.current))
        const projected = projectPoint(position, width, height, yawRef.current, pitchRef.current, zoomRef.current)
        const radius = clamp(planet.visualRadius * projected.factor * 5.6, 3.3, 46)
        return { planet, projected, radius }
      }).filter((entry) => entry.projected.visible).sort((left, right) => right.projected.depth - left.projected.depth)

      const screenPlanets: ScreenPlanet[] = []
      for (const { planet, projected, radius } of rendered) {
        if (planet.id === 'saturn') drawSaturnRings(context, planet, projected.x, projected.y, radius, pitchRef.current)
        if (planet.atmosphere) {
          const glow = context.createRadialGradient(projected.x, projected.y, radius * 0.8, projected.x, projected.y, radius * 1.55)
          glow.addColorStop(0, hexToRgba(planet.atmosphere, 0.12))
          glow.addColorStop(1, hexToRgba(planet.atmosphere, 0))
          context.fillStyle = glow
          context.beginPath()
          context.arc(projected.x, projected.y, radius * 1.55, 0, TAU)
          context.fill()
        }
        const spin = daysRef.current / Math.max(Math.abs(planet.rotationDays), 0.1)
        drawPlanetTexture(context, planet, projected.x, projected.y, radius, spin)
        if (planet.id === selectedId) {
          context.strokeStyle = 'rgba(255,255,255,.82)'
          context.lineWidth = 1.3
          context.beginPath()
          context.arc(projected.x, projected.y, radius * 1.38, 0, TAU)
          context.stroke()
        }
        if (showLabels && radius > 3.5) {
          context.font = `${Math.max(10, Math.min(13, radius * 0.6))}px ui-monospace, SFMono-Regular, Menlo, monospace`
          context.fillStyle = planet.id === selectedId ? 'rgba(255,255,255,.96)' : 'rgba(226,232,240,.8)'
          context.textAlign = 'center'
          context.fillText(planet.name[locale], projected.x, projected.y - radius - 9)
        }
        screenPlanets.push({ id: planet.id, x: projected.x, y: projected.y, radius, depth: projected.depth })
      }
      screenPlanetsRef.current = screenPlanets

      if (galacticMotion) {
        context.save()
        context.setLineDash([5, 7])
        context.strokeStyle = 'rgba(94, 169, 255, .18)'
        context.lineWidth = 1
        context.beginPath()
        context.arc(width * 0.5, height * 0.5, Math.min(width, height) * 0.43, Math.PI * 0.2, Math.PI * 0.78)
        context.stroke()
        context.restore()
      }

      frameRef.current = requestAnimationFrame(render)
    }

    frameRef.current = requestAnimationFrame(render)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      lastTimeRef.current = null
    }
  }, [galacticMotion, paused, selectedId, showLabels, showOrbits, showTrails, stars, locale])

  const selectAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const candidates = screenPlanetsRef.current
      .map((planet) => ({ planet, distance: Math.hypot(planet.x - x, planet.y - y) }))
      .filter(({ planet, distance }) => distance <= Math.max(14, planet.radius * 1.5))
      .sort((left, right) => left.distance - right.distance)
    if (candidates[0]) setSelectedId(candidates[0].planet.id)
  }

  const resetView = () => {
    setYaw(-0.42)
    setPitch(-0.28)
    setZoom(1)
  }

  return <div className="overflow-hidden rounded-3xl border border-blue-400/15 bg-[#05070d] shadow-[0_28px_90px_rgba(0,0,0,.4)]">
    <div className="relative min-h-[620px] overflow-hidden sm:min-h-[700px]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing"
        aria-label={copy.explorer.canvasLabel}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = { active: true, x: event.clientX, y: event.clientY, moved: 0 }
        }}
        onPointerMove={(event) => {
          if (!dragRef.current.active) return
          const dx = event.clientX - dragRef.current.x
          const dy = event.clientY - dragRef.current.y
          dragRef.current.x = event.clientX
          dragRef.current.y = event.clientY
          dragRef.current.moved += Math.abs(dx) + Math.abs(dy)
          setYaw((value) => value + dx * 0.005)
          setPitch((value) => clamp(value + dy * 0.004, -1.12, 1.12))
        }}
        onPointerUp={(event) => {
          const shouldSelect = dragRef.current.moved < 8
          dragRef.current.active = false
          if (shouldSelect) selectAt(event.clientX, event.clientY)
        }}
        onPointerCancel={() => { dragRef.current.active = false }}
        onWheel={(event) => {
          event.preventDefault()
          setZoom((value) => clamp(value * (event.deltaY > 0 ? 0.92 : 1.08), 0.55, 2.25))
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="max-w-[80%] rounded-2xl border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-xl">
          <p className="font-mono text-[10px] font-black uppercase tracking-[.2em] text-blue-300">NEXORA SOLAR 3D</p>
          <p className="mt-1 text-sm font-bold text-white">{copy.explorer.liveTitle}</p>
          <p className="mt-1 text-[11px] leading-5 text-zinc-300">{copy.explorer.liveText}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-right backdrop-blur-xl">
          <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">{copy.explorer.speed}</p>
          <p className="mt-1 font-mono text-xs font-black text-blue-200">{formatSpeed(speed, locale)}</p>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 right-4 grid gap-3 lg:grid-cols-[1fr_280px]">
        <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/45 p-3 backdrop-blur-xl sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="ops-button-primary !min-h-10 !px-3" onClick={() => setPaused((value) => !value)}>
              {paused ? <Play className="size-4"/> : <Pause className="size-4"/>}{paused ? copy.explorer.play : copy.explorer.pause}
            </button>
            <button type="button" className="ops-button-muted !min-h-10 !px-3" onClick={resetView}><RotateCcw className="size-4"/>{copy.explorer.reset}</button>
            <button type="button" className={showOrbits ? 'ops-button-muted !min-h-10 !px-3 !border-blue-400/30 !text-blue-200' : 'ops-button-muted !min-h-10 !px-3'} onClick={() => setShowOrbits((value) => !value)}><Orbit className="size-4"/>{copy.explorer.orbits}</button>
            <button type="button" className={showTrails ? 'ops-button-muted !min-h-10 !px-3 !border-cyan-400/30 !text-cyan-200' : 'ops-button-muted !min-h-10 !px-3'} onClick={() => setShowTrails((value) => !value)}><Route className="size-4"/>{copy.explorer.trails}</button>
            <button type="button" className={showLabels ? 'ops-button-muted !min-h-10 !px-3 !border-violet-400/30 !text-violet-200' : 'ops-button-muted !min-h-10 !px-3'} onClick={() => setShowLabels((value) => !value)}><Tags className="size-4"/>{copy.explorer.labels}</button>
            <button type="button" className={galacticMotion ? 'ops-button-muted !min-h-10 !px-3 !border-amber-400/30 !text-amber-200' : 'ops-button-muted !min-h-10 !px-3'} onClick={() => setGalacticMotion((value) => !value)}><Sparkles className="size-4"/>{copy.explorer.galactic}</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <span className="flex items-center gap-2 text-xs font-bold text-zinc-300"><CircleGaude className="size-4 text-blue-300"/>{copy.explorer.speed}</span>
            <input
              aria-label={copy.explorer.speed}
              type="range"
              min="0"
              max="100"
              step="1"
              value={sliderFromSpeed(speed)}
              onChange={(event) => setSpeed(speedFromSlider(Number(event.target.value)))}
              className="w-full accent-blue-400"
            />
            <span className="font-mono text-[11px] font-black text-blue-200">{formatSpeed(speed, locale)}</span>
          </div>
        </div>

        <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/55 p-4 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-black uppercase tracking-[.16em] text-blue-300">{selected.type[locale]}</p>
              <h3 className="mt-1 text-xl font-black text-white">{selected.name[locale]}</h3>
            </div>
            <Focus className="mt-1 size-5 text-blue-300"/>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-xl border border-white/[.08] bg-white/[.035] p-3"><p className="text-zinc-500">{copy.explorer.radius}</p><p className="mt-1 font-mono font-black text-zinc-100">{formatNumber(selected.radiusKm, locale)} km</p></div>
            <div className="rounded-xl border border-white/[.08] bg-white/[.035] p-3"><p className="text-zinc-500">{copy.explorer.year}</p><p className="mt-1 font-mono font-black text-zinc-100">{formatNumber(Math.round(selected.periodDays), locale)} d</p></div>
            <div className="rounded-xl border border-white/[.08] bg-white/[.035] p-3"><p className="text-zinc-500">{copy.explorer.moons}</p><p className="mt-1 font-mono font-black text-zinc-100">{selected.moons}</p></div>
            <div className="rounded-xl border border-white/[.08] bg-white/[.035] p-3"><p className="text-zinc-500">{copy.explorer.temperature}</p><p className="mt-1 font-mono font-black text-zinc-100">{selected.temp[locale]}</p></div>
          </div>
        </div>
      </div>
    </div>
    <div className="grid gap-px border-t border-white/[.08] bg-white/[.06] sm:grid-cols-3">
      <div className="bg-[#090b12] p-4"><p className="font-mono text-[10px] font-black uppercase tracking-[.16em] text-blue-300">{copy.explorer.scaleTitle}</p><p className="mt-2 text-xs leading-5 text-zinc-400">{copy.explorer.scaleText}</p></div>
      <div className="bg-[#090b12] p-4"><p className="font-mono text-[10px] font-black uppercase tracking-[.16em] text-cyan-300">{copy.explorer.controlsTitle}</p><p className="mt-2 text-xs leading-5 text-zinc-400">{copy.explorer.controlsText}</p></div>
      <div className="bg-[#090b12] p-4"><p className="font-mono text-[10px] font-black uppercase tracking-[.16em] text-amber-300">{copy.explorer.galaxyTitle}</p><p className="mt-2 text-xs leading-5 text-zinc-400">{copy.explorer.galaxyText}</p></div>
    </div>
  </div>
}
