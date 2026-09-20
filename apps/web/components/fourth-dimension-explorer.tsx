'use client'

import {
  Boxes,
  Calculator,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Square,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

type Point4 = readonly [number, number, number, number]
type Locale = 'es' | 'en'
type ExplorerMode = 'explorer' | 'journey'

const VERTICES: readonly Point4[] = [
  [-1, -1, -1, -1], [1, -1, -1, -1], [1, 1, -1, -1], [-1, 1, -1, -1],
  [-1, -1, 1, -1], [1, -1, 1, -1], [1, 1, 1, -1], [-1, 1, 1, -1],
  [-1, -1, -1, 1], [1, -1, -1, 1], [1, 1, -1, 1], [-1, 1, -1, 1],
  [-1, -1, 1, 1], [1, -1, 1, 1], [1, 1, 1, 1], [-1, 1, 1, 1],
]

const EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7], [8, 9], [9, 10], [10, 11], [11, 8],
  [12, 13], [13, 14], [14, 15], [15, 12], [8, 12], [9, 13], [10, 14], [11, 15],
  [0, 8], [1, 9], [2, 10], [3, 11], [4, 12], [5, 13], [6, 14], [7, 15],
]

const ui = {
  es: {
    projection: 'Proyección 4D → 3D → 2D',
    live: 'EN TIEMPO REAL',
    pause: 'Pausar',
    resume: 'Reanudar',
    reset: 'Restablecer',
    wRotation: 'Rotación W',
    speed: 'Velocidad',
    vertices: 'Vértices',
    edges: 'Aristas',
    faces: 'Caras 2D',
    cells: 'Celdas 3D',
    calculator: 'Calculadora del hipercubo',
    size: 'Tamaño de arista',
    hypervolume: 'Hipervolumen',
    surfaceVolume: 'Volumen superficial 3D',
    formula: 'Para arista a: V₄ = a⁴ y volumen superficial = 8a³.',
    dimension: 'Dimensión',
    previous: 'Anterior',
    next: 'Siguiente',
    dimensions: [
      ['0D', 'El punto', 'No tiene longitud, área ni volumen. Solo representa una posición.'],
      ['1D', 'La línea', 'Añade longitud: un grado de libertad a lo largo de un eje.'],
      ['2D', 'El plano', 'Añade anchura. Ahora aparecen superficies con área.'],
      ['3D', 'Nuestro espacio', 'Añade profundidad y permite objetos con volumen.'],
      ['4D', 'Hiperespacio', 'Añade una coordenada W independiente de x, y y z en el modelo matemático.'],
    ],
  },
  en: {
    projection: '4D → 3D → 2D projection',
    live: 'REAL TIME',
    pause: 'Pause',
    resume: 'Resume',
    reset: 'Reset',
    wRotation: 'W rotation',
    speed: 'Speed',
    vertices: 'Vertices',
    edges: 'Edges',
    faces: '2D faces',
    cells: '3D cells',
    calculator: 'Hypercube calculator',
    size: 'Edge size',
    hypervolume: 'Hypervolume',
    surfaceVolume: '3D surface volume',
    formula: 'For edge a: V₄ = a⁴ and surface volume = 8a³.',
    dimension: 'Dimension',
    previous: 'Previous',
    next: 'Next',
    dimensions: [
      ['0D', 'The point', 'It has no length, area or volume. It only represents a position.'],
      ['1D', 'The line', 'Adds length: one degree of freedom along an axis.'],
      ['2D', 'The plane', 'Adds width. Surfaces with area now appear.'],
      ['3D', 'Our space', 'Adds depth and allows objects with volume.'],
      ['4D', 'Hyperspace', 'Adds a W coordinate independent from x, y and z in the mathematical model.'],
    ],
  },
} as const

function rotate2D(a: number, b: number, angle: number): [number, number] {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return [a * cosine - b * sine, a * sine + b * cosine]
}

function rotate4D(point: Point4, time: number, wAngle: number) {
  let [x, y, z, w] = point
  ;[x, y] = rotate2D(x, y, time * 0.62)
  ;[x, z] = rotate2D(x, z, time * 0.47)
  ;[y, z] = rotate2D(y, z, time * 0.29)
  ;[x, w] = rotate2D(x, w, wAngle)
  ;[z, w] = rotate2D(z, w, wAngle * 0.38)
  return [x, y, z, w] as const
}

function project4D(point: readonly [number, number, number, number]) {
  const [x, y, z, w] = point
  const factor4D = 3 / (3 + w * 0.68)
  const x3 = x * factor4D
  const y3 = y * factor4D
  const z3 = z * factor4D
  const factor3D = 4 / (4 + z3)
  return [x3 * factor3D, y3 * factor3D, z3] as const
}

function TesseractCanvas({
  paused,
  speed,
  wDegrees,
}: {
  paused: boolean
  speed: number
  wDegrees: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const angleRef = useRef(0)
  const previousTimeRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    let frame = 0
    let width = 0
    let height = 0
    let dpr = 1

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const draw = (timestamp: number) => {
      const previous = previousTimeRef.current ?? timestamp
      const delta = Math.min(50, timestamp - previous)
      previousTimeRef.current = timestamp
      if (!paused) angleRef.current += delta * 0.00042 * speed

      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)

      const gradient = context.createRadialGradient(width * 0.5, height * 0.48, 8, width * 0.5, height * 0.5, Math.max(width, height) * 0.58)
      gradient.addColorStop(0, 'rgba(99,102,241,.16)')
      gradient.addColorStop(0.5, 'rgba(37,99,235,.055)')
      gradient.addColorStop(1, 'rgba(8,8,9,0)')
      context.fillStyle = gradient
      context.fillRect(0, 0, width, height)

      const scale = Math.min(width, height) * 0.21
      const wAngle = wDegrees * Math.PI / 180 + angleRef.current * 0.34
      const points = VERTICES.map((point) => project4D(rotate4D(point, angleRef.current, wAngle)))

      context.save()
      context.translate(width / 2, height / 2)

      context.beginPath()
      for (const [from, to] of EDGES) {
        const a = points[from]
        const b = points[to]
        context.moveTo(a[0] * scale, a[1] * scale)
        context.lineTo(b[0] * scale, b[1] * scale)
      }
      context.strokeStyle = 'rgba(129,140,248,.74)'
      context.lineWidth = Math.max(1, Math.min(2, width / 360))
      context.stroke()

      for (const [x, y, z] of points) {
        const depth = Math.max(0.35, Math.min(1.15, 0.78 - z * 0.1))
        context.beginPath()
        context.arc(x * scale, y * scale, 3.1 * depth, 0, Math.PI * 2)
        context.fillStyle = z < 0 ? 'rgba(103,232,249,.92)' : 'rgba(196,181,253,.96)'
        context.fill()
      }

      context.restore()
      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      previousTimeRef.current = null
    }
  }, [paused, speed, wDegrees])

  return <canvas
    ref={canvasRef}
    className="h-[360px] w-full rounded-xl border border-white/[.07] bg-[#09090b] sm:h-[460px] lg:h-[560px]"
    aria-label="Interactive tesseract projection"
  />
}

function HypercubeCalculator({ locale }: { locale: Locale }) {
  const t = ui[locale]
  const [size, setSize] = useState(1)
  const safeSize = Number.isFinite(size) && size > 0 ? size : 0
  const volume = safeSize ** 4
  const surfaceVolume = 8 * safeSize ** 3

  return <div className="ops-panel p-5">
    <div className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-lg border border-blue-500/20 bg-blue-500/[.08]">
        <Calculator className="size-4 text-blue-300"/>
      </span>
      <div>
        <p className="font-mono text-[10px] font-black uppercase tracking-[.15em] text-blue-400">4D MATH</p>
        <h3 className="mt-1 font-black text-white">{t.calculator}</h3>
      </div>
    </div>

    <label className="mt-5 block text-xs font-bold text-zinc-300" htmlFor="hypercube-size">{t.size}</label>
    <input
      id="hypercube-size"
      type="number"
      min="0.1"
      max="100"
      step="0.1"
      value={size}
      onChange={(event) => setSize(Number(event.target.value))}
      className="ops-input mt-2"
    />

    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <div className="rounded-xl border border-white/[.07] bg-black/20 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t.hypervolume}</p>
        <p className="mt-2 font-mono text-lg font-black text-cyan-300">{volume.toFixed(4)}</p>
      </div>
      <div className="rounded-xl border border-white/[.07] bg-black/20 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t.surfaceVolume}</p>
        <p className="mt-2 font-mono text-lg font-black text-violet-300">{surfaceVolume.toFixed(4)}</p>
      </div>
    </div>
    <p className="mt-4 text-xs leading-5 text-zinc-500">{t.formula}</p>
  </div>
}

function Explorer({ locale }: { locale: Locale }) {
  const t = ui[locale]
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [wDegrees, setWDegrees] = useState(22)
  const key = `${paused}-${speed}-${wDegrees}`

  const stats = [
    [t.vertices, '16'],
    [t.edges, '32'],
    [t.faces, '24'],
    [t.cells, '8'],
  ]

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
    <div className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-white/[.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-black uppercase tracking-[.16em] text-violet-300">{t.projection}</p>
          <p className="mt-1 text-xs text-zinc-500">{t.live}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ops-button-muted" onClick={() => setPaused((value) => !value)}>
            {paused ? <Play className="size-4"/> : <Pause className="size-4"/>}
            {paused ? t.resume : t.pause}
          </button>
          <button
            type="button"
            className="ops-button-muted"
            onClick={() => {
              setPaused(false)
              setSpeed(1)
              setWDegrees(22)
            }}
          >
            <RotateCcw className="size-4"/>{t.reset}
          </button>
        </div>
      </div>

      <div className="p-3 md:p-5">
        <TesseractCanvas key={key} paused={paused} speed={speed} wDegrees={wDegrees}/>
      </div>

      <div className="grid gap-3 border-t border-white/[.07] p-5 md:grid-cols-2">
        <label className="block">
          <span className="flex items-center justify-between text-xs font-bold text-zinc-300">
            <span className="flex items-center gap-2"><SlidersHorizontal className="size-3.5 text-violet-300"/>{t.wRotation}</span>
            <span className="font-mono text-violet-300">{wDegrees}°</span>
          </span>
          <input
            type="range"
            min="0"
            max="360"
            step="1"
            value={wDegrees}
            onChange={(event) => setWDegrees(Number(event.target.value))}
            className="mt-3 w-full accent-violet-500"
          />
        </label>
        <label className="block">
          <span className="flex items-center justify-between text-xs font-bold text-zinc-300">
            <span>{t.speed}</span>
            <span className="font-mono text-cyan-300">{speed.toFixed(1)}×</span>
          </span>
          <input
            type="range"
            min="0.2"
            max="3"
            step="0.1"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            className="mt-3 w-full accent-cyan-500"
          />
        </label>
      </div>
    </div>

    <div className="space-y-4">
      <div className="ops-panel overflow-hidden">
        <div className="border-b border-white/[.07] px-5 py-4">
          <p className="font-mono text-[10px] font-black uppercase tracking-[.16em] text-cyan-300">TESSERACT / STATS</p>
        </div>
        <div className="grid grid-cols-2 gap-px bg-white/[.06]">
          {stats.map(([label, value]) =>
            <div key={label} className="bg-[#101012] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
              <p className="mt-2 font-mono text-xl font-black text-white">{value}</p>
            </div>
          )}
        </div>
      </div>
      <HypercubeCalculator locale={locale}/>
    </div>
  </div>
}

function DimensionGlyph({ index }: { index: number }) {
  if (index === 0) {
    return <div className="grid h-56 place-items-center"><CircleDot className="size-14 text-cyan-300"/></div>
  }
  if (index === 1) {
    return <div className="grid h-56 place-items-center"><div className="h-1 w-52 rounded-full bg-gradient-to-r from-transparent via-blue-400 to-transparent"/></div>
  }
  if (index === 2) {
    return <div className="grid h-56 place-items-center"><Square className="size-28 text-blue-300" strokeWidth={1.2}/></div>
  }
  if (index === 3) {
    return <div className="grid h-56 place-items-center">
      <div className="relative size-28">
        <div className="absolute inset-0 border border-cyan-300/70"/>
        <div className="absolute inset-0 translate-x-6 -translate-y-6 border border-violet-300/70"/>
        <span className="absolute left-0 top-0 h-px w-8 origin-left -rotate-45 bg-blue-300/70"/>
        <span className="absolute right-0 top-0 h-px w-8 origin-right rotate-45 bg-blue-300/70"/>
        <span className="absolute bottom-0 left-0 h-px w-8 origin-left rotate-45 bg-blue-300/70"/>
        <span className="absolute bottom-0 right-0 h-px w-8 origin-right -rotate-45 bg-blue-300/70"/>
      </div>
    </div>
  }
  return <div className="grid h-56 place-items-center">
    <div className="relative size-36">
      <div className="absolute inset-7 rotate-12 border border-violet-300/80"/>
      <div className="absolute inset-2 -rotate-6 border border-cyan-300/70"/>
      <div className="absolute inset-0 rounded-full border border-dashed border-blue-400/30"/>
      <Boxes className="absolute inset-0 m-auto size-14 text-violet-200"/>
    </div>
  </div>
}

function Journey({ locale }: { locale: Locale }) {
  const t = ui[locale]
  const [dimension, setDimension] = useState(0)
  const current = t.dimensions[dimension]
  const progress = useMemo(() => dimension / (t.dimensions.length - 1) * 100, [dimension, t.dimensions.length])

  return <div className="ops-panel overflow-hidden">
    <div className="grid lg:grid-cols-[.9fr_1.1fr]">
      <div className="border-b border-white/[.07] bg-[#0c0c0f] p-5 lg:border-b-0 lg:border-r md:p-7">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-black uppercase tracking-[.16em] text-cyan-300">{t.dimension} {current[0]}</span>
          <span className="ops-badge-good">{dimension + 1}/{t.dimensions.length}</span>
        </div>
        <DimensionGlyph index={dimension}/>
        <div className="h-1 overflow-hidden rounded-full bg-white/[.06]">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-violet-500 to-cyan-400 transition-[width] duration-500" style={{ width: `${progress}%` }}/>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            className="ops-button-muted"
            disabled={dimension === 0}
            onClick={() => setDimension((value) => Math.max(0, value - 1))}
          >
            <ChevronLeft className="size-4"/>{t.previous}
          </button>
          <button
            type="button"
            className="ops-button-primary"
            disabled={dimension === t.dimensions.length - 1}
            onClick={() => setDimension((value) => Math.min(t.dimensions.length - 1, value + 1))}
          >
            {t.next}<ChevronRight className="size-4"/>
          </button>
        </div>
      </div>

      <div className="flex min-h-[360px] flex-col justify-center p-6 md:p-10">
        <p className="font-mono text-5xl font-black tracking-[-.05em] text-white md:text-7xl">{current[0]}</p>
        <h3 className="mt-5 text-2xl font-black tracking-tight text-white md:text-3xl">{current[1]}</h3>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300 md:text-base">{current[2]}</p>
        <div className="mt-8 grid grid-cols-5 gap-2">
          {t.dimensions.map(([label], index) =>
            <button
              key={label}
              type="button"
              onClick={() => setDimension(index)}
              aria-label={`${t.dimension} ${label}`}
              className={index === dimension
                ? 'rounded-lg border border-cyan-400/35 bg-cyan-400/[.1] px-2 py-3 font-mono text-xs font-black text-cyan-200'
                : 'rounded-lg border border-white/[.07] bg-white/[.025] px-2 py-3 font-mono text-xs font-bold text-zinc-500 hover:text-zinc-200'}
            >
              {label}
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
}

export function FourthDimensionExplorer({
  locale,
  mode = 'explorer',
}: {
  locale: Locale
  mode?: ExplorerMode
}) {
  return mode === 'journey' ? <Journey locale={locale}/> : <Explorer locale={locale}/>
}
