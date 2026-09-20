'use client'

import {
  Activity,
  Atom,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Download,
  FlaskConical,
  Gauge,
  Pause,
  Play,
  RefreshCcw,
  Scissors,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fourthDimensionLabCopy,
  fourthDimensionPageCopy,
  type FourthDimensionLocale,
} from '../lib/fourth-dimension-i18n'

type Point4 = [number, number, number, number]
type Edge = [number, number]
type FigureKey = 'hypercube' | 'hypersphere' | 'pentachoron' | 'hypertorus' | 'hyperpyramid'
type SliceKey = 'hypercube' | 'hypersphere' | 'hypertorus'
type EquationKey = 'hypersphere' | 'hyperplane' | 'wave' | 'quartic'
type ArtKey = 'orbit' | 'lissajous' | 'interference'

const HYPERCUBE_POINTS: Point4[] = [
  [-1, -1, -1, -1], [1, -1, -1, -1], [1, 1, -1, -1], [-1, 1, -1, -1],
  [-1, -1, 1, -1], [1, -1, 1, -1], [1, 1, 1, -1], [-1, 1, 1, -1],
  [-1, -1, -1, 1], [1, -1, -1, 1], [1, 1, -1, 1], [-1, 1, -1, 1],
  [-1, -1, 1, 1], [1, -1, 1, 1], [1, 1, 1, 1], [-1, 1, 1, 1],
]

const HYPERCUBE_EDGES: Edge[] = [
  [0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7],
  [8,9],[9,10],[10,11],[11,8],[12,13],[13,14],[14,15],[15,12],[8,12],[9,13],[10,14],[11,15],
  [0,8],[1,9],[2,10],[3,11],[4,12],[5,13],[6,14],[7,15],
]

function rotatePair(a: number, b: number, angle: number): [number, number] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [a * c - b * s, a * s + b * c]
}

function rotate4(point: Point4, time: number, wAngle: number): Point4 {
  let [x, y, z, w] = point
  ;[x, y] = rotatePair(x, y, time * 0.57)
  ;[x, z] = rotatePair(x, z, time * 0.31)
  ;[y, z] = rotatePair(y, z, time * 0.23)
  ;[x, w] = rotatePair(x, w, wAngle + time * 0.18)
  ;[z, w] = rotatePair(z, w, wAngle * 0.47 + time * 0.11)
  return [x, y, z, w]
}

function project4(point: Point4, perspective: number, visibleW: number) {
  const [x, y, z, rawW] = point
  const w = rawW * visibleW
  const d4 = 3.25 + perspective * 0.25
  const f4 = d4 / Math.max(1.15, d4 - w * 0.72)
  const x3 = x * f4
  const y3 = y * f4
  const z3 = z * f4
  const d3 = 4.3
  const f3 = d3 / Math.max(1.2, d3 - z3 * 0.55)
  return [x3 * f3, y3 * f3, z3] as const
}

function completeGraphEdges(size: number): Edge[] {
  const edges: Edge[] = []
  for (let i = 0; i < size; i += 1) {
    for (let j = i + 1; j < size; j += 1) edges.push([i, j])
  }
  return edges
}

function figureGeometry(key: FigureKey): { points: Point4[]; edges: Edge[] } {
  if (key === 'hypercube') return { points: HYPERCUBE_POINTS, edges: HYPERCUBE_EDGES }

  if (key === 'pentachoron') {
    const a = 1 / Math.sqrt(5)
    const points: Point4[] = [
      [1, 1, 1, -a],
      [1, -1, -1, -a],
      [-1, 1, -1, -a],
      [-1, -1, 1, -a],
      [0, 0, 0, 4 * a],
    ]
    return { points, edges: completeGraphEdges(points.length) }
  }

  if (key === 'hyperpyramid') {
    const base: Point4[] = [
      [-1,-1,-1,-0.8],[1,-1,-1,-0.8],[1,1,-1,-0.8],[-1,1,-1,-0.8],
      [-1,-1,1,-0.8],[1,-1,1,-0.8],[1,1,1,-0.8],[-1,1,1,-0.8],
    ]
    const points: Point4[] = [...base, [0,0,0,1.65]]
    const edges: Edge[] = [...HYPERCUBE_EDGES.slice(0, 12)]
    for (let i = 0; i < 8; i += 1) edges.push([i, 8])
    return { points, edges }
  }

  if (key === 'hypertorus') {
    const points: Point4[] = []
    const edges: Edge[] = []
    const cols = 14
    const rows = 14
    for (let r = 0; r < rows; r += 1) {
      const v = (r / rows) * Math.PI * 2
      for (let c = 0; c < cols; c += 1) {
        const u = (c / cols) * Math.PI * 2
        points.push([Math.cos(u), Math.sin(u), Math.cos(v), Math.sin(v)])
        const index = r * cols + c
        edges.push([index, r * cols + ((c + 1) % cols)])
        edges.push([index, ((r + 1) % rows) * cols + c])
      }
    }
    return { points, edges }
  }

  const points: Point4[] = []
  for (let i = 0; i < 260; i += 1) {
    const u = i * 2.399963229728653
    const v = Math.acos(1 - 2 * ((i + 0.5) / 260))
    const q = i * 1.324717957244746
    points.push([
      Math.cos(u) * Math.sin(v),
      Math.sin(u) * Math.sin(v),
      Math.cos(v) * Math.cos(q),
      Math.cos(v) * Math.sin(q),
    ])
  }
  return { points, edges: [] }
}

function prepareCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const width = Math.max(1, rect.width)
  const height = Math.max(1, rect.height)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, width, height }
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.clearRect(0, 0, width, height)
  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.45, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.65)
  gradient.addColorStop(0, 'rgba(99,102,241,.16)')
  gradient.addColorStop(0.48, 'rgba(37,99,235,.055)')
  gradient.addColorStop(1, 'rgba(8,8,9,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = 'rgba(255,255,255,.035)'
  ctx.lineWidth = 1
  const step = Math.max(28, Math.min(width, height) / 10)
  for (let x = width / 2 % step; x < width; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let y = height / 2 % step; y < height; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
}

function downloadCanvas(canvas: HTMLCanvasElement | null, filename: string) {
  if (!canvas) return
  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = filename
  link.click()
}

function Gallery({ locale }: { locale: FourthDimensionLocale }) {
  const t = fourthDimensionLabCopy[locale]
  const [figure, setFigure] = useState<FigureKey>('hypercube')
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [wAngle, setWAngle] = useState(26)
  const [perspective, setPerspective] = useState(5)
  const [visibleW, setVisibleW] = useState(1)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const angleRef = useRef(0)
  const geometry = useMemo(() => figureGeometry(figure), [figure])
  const info = t.gallery.figures[figure]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let frame = 0
    let last = performance.now()
    const draw = (now: number) => {
      const prepared = prepareCanvas(canvas)
      if (!prepared) return
      const { ctx, width, height } = prepared
      if (!paused) {
        const delta = Math.min(40, now - last)
        angleRef.current += delta * 0.00042 * speed
      }
      last = now
      drawGrid(ctx, width, height)
      const scale = Math.min(width, height) * (figure === 'hypertorus' ? 0.17 : 0.21)
      const w = wAngle * Math.PI / 180
      const points = geometry.points.map((point) => project4(rotate4(point, angleRef.current, w), perspective, visibleW))

      ctx.save()
      ctx.translate(width / 2, height / 2)
      if (geometry.edges.length) {
        ctx.beginPath()
        for (const [from, to] of geometry.edges) {
          const a = points[from]
          const b = points[to]
          if (!a || !b) continue
          ctx.moveTo(a[0] * scale, a[1] * scale)
          ctx.lineTo(b[0] * scale, b[1] * scale)
        }
        ctx.strokeStyle = figure === 'hypertorus' ? 'rgba(103,232,249,.34)' : 'rgba(129,140,248,.62)'
        ctx.lineWidth = figure === 'hypertorus' ? 0.75 : 1.35
        ctx.stroke()
      }

      for (let i = 0; i < points.length; i += 1) {
        const point = points[i]
        const z = point[2]
        const radius = geometry.edges.length ? 2.6 : 1.9
        ctx.beginPath()
        ctx.arc(point[0] * scale, point[1] * scale, radius, 0, Math.PI * 2)
        ctx.fillStyle = z < 0 ? 'rgba(103,232,249,.86)' : 'rgba(196,181,253,.9)'
        ctx.fill()
      }
      ctx.restore()
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [geometry, paused, perspective, speed, visibleW, wAngle, figure])

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
    <div className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-white/[.07] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] font-black uppercase tracking-[.16em] text-violet-300">{info.name}</p>
          <p className="mt-1 text-xs text-zinc-500">{info.description}</p>
        </div>
        <div className="flex gap-2">
          <button className="ops-button-muted" type="button" onClick={() => setPaused((value) => !value)}>
            {paused ? <Play className="size-4"/> : <Pause className="size-4"/>}{paused ? t.common.resume : t.common.pause}
          </button>
          <button className="ops-button-muted" type="button" onClick={() => downloadCanvas(canvasRef.current, 'fourth-dimension-gallery.png')}>
            <Download className="size-4"/>{t.common.download}
          </button>
        </div>
      </div>
      <div className="p-3 md:p-5">
        <canvas ref={canvasRef} aria-label={t.gallery.canvas} className="h-[420px] w-full rounded-xl border border-white/[.07] bg-[#09090b] md:h-[560px]"/>
      </div>
    </div>

    <div className="space-y-4">
      <div className="ops-panel p-5">
        <label className="block text-xs font-bold text-zinc-300">
          {t.gallery.figure}
          <select className="ops-input mt-2" value={figure} onChange={(event) => setFigure(event.target.value as FigureKey)}>
            {(Object.keys(t.gallery.figures) as FigureKey[]).map((key) => <option key={key} value={key}>{t.gallery.figures[key].name}</option>)}
          </select>
        </label>
        {([
          [t.gallery.rotation, speed, setSpeed, 0, 3, 0.1],
          [t.gallery.wAngle, wAngle, setWAngle, 0, 360, 1],
          [t.gallery.perspective, perspective, setPerspective, 1, 10, 0.1],
          [t.gallery.visibleW, visibleW, setVisibleW, 0, 1.5, 0.05],
        ] as const).map(([label, value, setter, min, max, step]) => <label key={label} className="mt-5 block">
          <span className="flex justify-between gap-3 text-xs font-bold text-zinc-300"><span>{label}</span><span className="font-mono text-cyan-300">{Number(value).toFixed(step < 1 ? 1 : 0)}</span></span>
          <input className="mt-3 w-full accent-violet-500" type="range" min={min} max={max} step={step} value={value} onChange={(event) => setter(Number(event.target.value))}/>
        </label>)}
        <button type="button" className="ops-button-muted mt-5 w-full" onClick={() => { setSpeed(1); setWAngle(26); setPerspective(5); setVisibleW(1); angleRef.current = 0 }}>
          <RefreshCcw className="size-4"/>{t.common.reset}
        </button>
      </div>

      <div className="ops-panel overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-white/[.06]">
          {info.stats.map((value, index) => <div key={t.gallery.stats[index]} className="bg-[#101012] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t.gallery.stats[index]}</p>
            <p className="mt-2 font-mono text-xl font-black text-white">{value}</p>
          </div>)}
        </div>
      </div>
    </div>
  </div>
}

function SliceSimulator({ locale }: { locale: FourthDimensionLocale }) {
  const t = fourthDimensionLabCopy[locale]
  const [objectKey, setObjectKey] = useState<SliceKey>('hypersphere')
  const [position, setPosition] = useState(0)
  const [thickness, setThickness] = useState(0.3)
  const [running, setRunning] = useState(false)
  const contextRef = useRef<HTMLCanvasElement | null>(null)
  const sliceRef = useRef<HTMLCanvasElement | null>(null)
  const phaseRef = useRef(0)

  useEffect(() => {
    if (!running) return
    let frame = 0
    let last = performance.now()
    const animate = (now: number) => {
      const delta = Math.min(40, now - last)
      last = now
      phaseRef.current += delta * 0.0012
      setPosition(Math.sin(phaseRef.current) * 1.15)
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [running])

  useEffect(() => {
    const contextCanvas = contextRef.current
    const sliceCanvas = sliceRef.current
    if (!contextCanvas || !sliceCanvas) return

    const a = prepareCanvas(contextCanvas)
    const b = prepareCanvas(sliceCanvas)
    if (!a || !b) return
    drawGrid(a.ctx, a.width, a.height)
    drawGrid(b.ctx, b.width, b.height)

    const centerX = a.width / 2
    const centerY = a.height / 2
    const radius = Math.min(a.width, a.height) * 0.28

    a.ctx.save()
    a.ctx.translate(centerX, centerY)
    a.ctx.strokeStyle = 'rgba(129,140,248,.75)'
    a.ctx.lineWidth = 1.5
    if (objectKey === 'hypercube') {
      a.ctx.strokeRect(-radius, -radius, radius * 2, radius * 2)
      a.ctx.strokeRect(-radius * 0.62, -radius * 0.62, radius * 1.24, radius * 1.24)
      for (const [sx, sy] of [[-1,-1],[1,-1],[1,1],[-1,1]] as const) {
        a.ctx.beginPath()
        a.ctx.moveTo(sx * radius, sy * radius)
        a.ctx.lineTo(sx * radius * 0.62, sy * radius * 0.62)
        a.ctx.stroke()
      }
    } else {
      a.ctx.beginPath()
      a.ctx.arc(0, 0, radius, 0, Math.PI * 2)
      a.ctx.stroke()
      if (objectKey === 'hypertorus') {
        a.ctx.beginPath()
        a.ctx.ellipse(0, 0, radius, radius * 0.38, 0, 0, Math.PI * 2)
        a.ctx.stroke()
      }
    }
    const planeY = Math.max(-radius * 1.25, Math.min(radius * 1.25, position / 1.25 * radius))
    a.ctx.fillStyle = 'rgba(34,211,238,.12)'
    a.ctx.fillRect(-radius * 1.35, planeY - Math.max(2, thickness * 10), radius * 2.7, Math.max(4, thickness * 20))
    a.ctx.strokeStyle = 'rgba(103,232,249,.85)'
    a.ctx.beginPath()
    a.ctx.moveTo(-radius * 1.4, planeY)
    a.ctx.lineTo(radius * 1.4, planeY)
    a.ctx.stroke()
    a.ctx.restore()

    const absW = Math.abs(position)
    let sectionRadius = 0
    if (objectKey === 'hypercube') sectionRadius = absW <= 1 ? 1 : 0
    if (objectKey === 'hypersphere') sectionRadius = absW <= 1 ? Math.sqrt(Math.max(0, 1 - position * position)) : 0
    if (objectKey === 'hypertorus') sectionRadius = absW <= 1.2 ? 0.42 + 0.5 * Math.sqrt(Math.max(0, 1 - (position / 1.2) ** 2)) : 0

    const sr = Math.min(b.width, b.height) * 0.29 * sectionRadius
    b.ctx.save()
    b.ctx.translate(b.width / 2, b.height / 2)
    b.ctx.strokeStyle = 'rgba(196,181,253,.9)'
    b.ctx.fillStyle = 'rgba(139,92,246,.12)'
    b.ctx.lineWidth = 2
    if (sectionRadius <= 0.01) {
      b.ctx.beginPath()
      b.ctx.arc(0, 0, 4, 0, Math.PI * 2)
      b.ctx.fillStyle = 'rgba(244,63,94,.8)'
      b.ctx.fill()
    } else if (objectKey === 'hypercube') {
      b.ctx.fillRect(-sr, -sr, sr * 2, sr * 2)
      b.ctx.strokeRect(-sr, -sr, sr * 2, sr * 2)
    } else if (objectKey === 'hypertorus') {
      b.ctx.beginPath()
      b.ctx.arc(0, 0, sr, 0, Math.PI * 2)
      b.ctx.stroke()
      b.ctx.beginPath()
      b.ctx.arc(0, 0, sr * 0.48, 0, Math.PI * 2)
      b.ctx.stroke()
    } else {
      b.ctx.beginPath()
      b.ctx.arc(0, 0, sr, 0, Math.PI * 2)
      b.ctx.fill()
      b.ctx.stroke()
    }
    b.ctx.restore()
  }, [objectKey, position, thickness])

  return <div className="ops-panel overflow-hidden">
    <div className="grid gap-px bg-white/[.06] lg:grid-cols-2">
      <div className="bg-[#101012] p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] font-black uppercase tracking-[.15em] text-cyan-300">{t.slicer.context}</span>
          <span className="font-mono text-xs text-zinc-500">W={position.toFixed(2)}</span>
        </div>
        <canvas ref={contextRef} aria-label={t.slicer.canvasContext} className="h-[320px] w-full rounded-xl border border-white/[.07] bg-[#09090b]"/>
      </div>
      <div className="bg-[#101012] p-4 md:p-5">
        <div className="mb-3 font-mono text-[10px] font-black uppercase tracking-[.15em] text-violet-300">{t.slicer.section}</div>
        <canvas ref={sliceRef} aria-label={t.slicer.canvasSlice} className="h-[320px] w-full rounded-xl border border-white/[.07] bg-[#09090b]"/>
      </div>
    </div>
    <div className="grid gap-5 border-t border-white/[.07] p-5 md:grid-cols-4">
      <label className="block text-xs font-bold text-zinc-300">{t.slicer.object}
        <select className="ops-input mt-2" value={objectKey} onChange={(event) => setObjectKey(event.target.value as SliceKey)}>
          {(Object.keys(t.slicer.objects) as SliceKey[]).map((key) => <option key={key} value={key}>{t.slicer.objects[key]}</option>)}
        </select>
      </label>
      <label className="block text-xs font-bold text-zinc-300">{t.slicer.position}
        <input className="mt-4 w-full accent-cyan-500" type="range" min="-1.25" max="1.25" step="0.01" value={position} onChange={(event) => { setRunning(false); setPosition(Number(event.target.value)) }}/>
      </label>
      <label className="block text-xs font-bold text-zinc-300">{t.slicer.thickness}
        <input className="mt-4 w-full accent-violet-500" type="range" min="0.1" max="1" step="0.05" value={thickness} onChange={(event) => setThickness(Number(event.target.value))}/>
      </label>
      <div className="flex items-end gap-2">
        <button type="button" className="ops-button-primary flex-1" onClick={() => setRunning((value) => !value)}>{running ? <Pause className="size-4"/> : <Play className="size-4"/>}{running ? t.common.pause : t.slicer.auto}</button>
        <button type="button" className="ops-button-muted" onClick={() => { setRunning(false); setPosition(0); setThickness(0.3) }}><RefreshCcw className="size-4"/></button>
      </div>
    </div>
    <div className="border-t border-white/[.07] px-5 py-4 text-xs leading-5 text-zinc-400">{t.slicer.notes[objectKey]}</div>
  </div>
}

function EquationLab({ locale }: { locale: FourthDimensionLocale }) {
  const t = fourthDimensionLabCopy[locale]
  const [preset, setPreset] = useState<EquationKey>('hypersphere')
  const [w, setW] = useState(0)
  const [scale, setScale] = useState(1)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const info = t.equation.presets[preset]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const prepared = prepareCanvas(canvas)
    if (!prepared) return
    const { ctx, width, height } = prepared
    drawGrid(ctx, width, height)
    const step = 4
    const range = 2.4 / scale

    for (let py = 0; py < height; py += step) {
      const y = ((py / height) * 2 - 1) * range
      for (let px = 0; px < width; px += step) {
        const x = ((px / width) * 2 - 1) * range
        let value = 0
        if (preset === 'hypersphere') value = x * x + y * y + w * w - 1
        else if (preset === 'hyperplane') value = x + y + w
        else if (preset === 'wave') value = Math.sin(x * 2.2 + w * 2) + Math.cos(y * 2.2 - w * 2)
        else value = x ** 4 + y ** 4 + w ** 4 - 1

        const threshold = preset === 'wave' ? 0.16 : 0.12
        if (Math.abs(value) < threshold) {
          const intensity = Math.max(0.18, 1 - Math.abs(value) / threshold)
          ctx.fillStyle = value < 0 ? `rgba(103,232,249,${intensity})` : `rgba(196,181,253,${intensity})`
          ctx.fillRect(px, py, step, step)
        }
      }
    }
  }, [preset, scale, w])

  return <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
    <div className="ops-panel p-5">
      <div className="flex items-center gap-3"><FlaskConical className="size-5 text-violet-300"/><span className="font-mono text-[10px] font-black uppercase tracking-[.15em] text-violet-300">4D MATH LAB</span></div>
      <label className="mt-5 block text-xs font-bold text-zinc-300">{t.equation.family}
        <select className="ops-input mt-2" value={preset} onChange={(event) => setPreset(event.target.value as EquationKey)}>
          {(Object.keys(t.equation.presets) as EquationKey[]).map((key) => <option key={key} value={key}>{t.equation.presets[key].name}</option>)}
        </select>
      </label>
      <div className="mt-5 rounded-xl border border-violet-500/20 bg-violet-500/[.07] p-4">
        <p className="font-mono text-sm font-black text-violet-200">{info.formula}</p>
        <p className="mt-2 text-xs leading-5 text-zinc-400">{info.note}</p>
      </div>
      <label className="mt-5 block text-xs font-bold text-zinc-300"><span className="flex justify-between"><span>{t.equation.wValue}</span><span className="font-mono text-cyan-300">{w.toFixed(2)}</span></span>
        <input className="mt-3 w-full accent-cyan-500" type="range" min="-1.5" max="1.5" step="0.02" value={w} onChange={(event) => setW(Number(event.target.value))}/>
      </label>
      <label className="mt-5 block text-xs font-bold text-zinc-300"><span className="flex justify-between"><span>{t.equation.scale}</span><span className="font-mono text-cyan-300">{scale.toFixed(1)}×</span></span>
        <input className="mt-3 w-full accent-violet-500" type="range" min="0.6" max="2" step="0.1" value={scale} onChange={(event) => setScale(Number(event.target.value))}/>
      </label>
    </div>
    <div className="ops-panel p-3 md:p-5">
      <canvas ref={canvasRef} aria-label={t.equation.canvas} className="h-[440px] w-full rounded-xl border border-white/[.07] bg-[#09090b]"/>
    </div>
  </div>
}

function RelativityLab({ locale }: { locale: FourthDimensionLocale }) {
  const t = fourthDimensionLabCopy[locale]
  const [velocity, setVelocity] = useState(0.72)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const gamma = 1 / Math.sqrt(Math.max(0.0001, 1 - velocity * velocity))
  const properTime = 10
  const externalTime = properTime * gamma
  const contracted = 1 / gamma

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const prepared = prepareCanvas(canvas)
    if (!prepared) return
    const { ctx, width, height } = prepared
    drawGrid(ctx, width, height)
    const originX = width * 0.5
    const bottom = height * 0.86
    const top = height * 0.12
    ctx.strokeStyle = 'rgba(255,255,255,.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(originX, bottom)
    ctx.lineTo(originX, top)
    ctx.moveTo(width * 0.12, bottom)
    ctx.lineTo(width * 0.88, bottom)
    ctx.stroke()

    const maxDx = width * 0.32
    const dx = maxDx * velocity
    ctx.strokeStyle = 'rgba(103,232,249,.9)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(originX, bottom)
    ctx.lineTo(originX + dx, top)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(196,181,253,.82)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(originX, bottom)
    ctx.lineTo(originX - maxDx, top)
    ctx.moveTo(originX, bottom)
    ctx.lineTo(originX + maxDx, top)
    ctx.stroke()

    for (let i = 1; i <= 5; i += 1) {
      const y = bottom - (bottom - top) * (i / 5)
      ctx.fillStyle = 'rgba(255,255,255,.55)'
      ctx.fillRect(originX - 3, y, 6, 1)
    }
  }, [velocity])

  const cards = [
    [t.relativity.gamma, gamma.toFixed(3)],
    [t.relativity.properTime, `${properTime.toFixed(1)} ${t.relativity.years}`],
    [t.relativity.earthTime, `${externalTime.toFixed(2)} ${t.relativity.years}`],
    [t.relativity.contractedLength, contracted.toFixed(3)],
  ]

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
    <div className="ops-panel p-3 md:p-5">
      <canvas ref={canvasRef} aria-label={t.relativity.canvas} className="h-[430px] w-full rounded-xl border border-white/[.07] bg-[#09090b]"/>
    </div>
    <div className="space-y-4">
      <div className="ops-panel p-5">
        <div className="flex items-center gap-3"><Gauge className="size-5 text-cyan-300"/><span className="font-mono text-[10px] font-black uppercase tracking-[.15em] text-cyan-300">SPECIAL RELATIVITY</span></div>
        <label className="mt-5 block text-xs font-bold text-zinc-300">
          <span className="flex justify-between"><span>{t.relativity.velocity}</span><span className="font-mono text-cyan-300">{velocity.toFixed(3)}c</span></span>
          <input className="mt-3 w-full accent-cyan-500" type="range" min="0" max="0.99" step="0.005" value={velocity} onChange={(event) => setVelocity(Number(event.target.value))}/>
        </label>
        <p className="mt-4 text-xs leading-5 text-zinc-500">{t.relativity.reference}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {cards.map(([label, value]) => <div key={label} className="ops-panel p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p><p className="mt-2 font-mono text-base font-black text-white">{value}</p></div>)}
      </div>
    </div>
  </div>
}

function seeded(seed: number, index: number) {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453
  return value - Math.floor(value)
}

function ArtLab({ locale }: { locale: FourthDimensionLocale }) {
  const t = fourthDimensionLabCopy[locale]
  const [algorithm, setAlgorithm] = useState<ArtKey>('orbit')
  const [complexity, setComplexity] = useState(7)
  const [seed, setSeed] = useState(42)
  const [animated, setAnimated] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const timeRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let frame = 0
    let last = performance.now()
    const draw = (now: number) => {
      if (animated) timeRef.current += Math.min(40, now - last) * 0.00035
      last = now
      const prepared = prepareCanvas(canvas)
      if (!prepared) return
      const { ctx, width, height } = prepared
      drawGrid(ctx, width, height)
      ctx.save()
      ctx.translate(width / 2, height / 2)
      ctx.globalCompositeOperation = 'lighter'
      const count = 180 + complexity * 90
      for (let i = 0; i < count; i += 1) {
        const u = i / count * Math.PI * 2
        const noise = seeded(seed, i)
        let x = 0
        let y = 0
        if (algorithm === 'orbit') {
          const r = Math.min(width, height) * (0.12 + 0.28 * noise)
          x = Math.cos(u * (2 + complexity * 0.18) + timeRef.current) * r
          y = Math.sin(u * (3 + complexity * 0.12) - timeRef.current * 1.3) * r
        } else if (algorithm === 'lissajous') {
          const r = Math.min(width, height) * 0.34
          x = Math.sin(u * (2 + complexity) + timeRef.current) * r
          y = Math.sin(u * (3 + complexity * 0.5) + Math.PI / 2 + timeRef.current * 0.7) * r
        } else {
          const r = Math.min(width, height) * 0.38
          x = (u / (Math.PI * 2) - 0.5) * r * 2
          y = Math.sin(u * complexity + timeRef.current * 2) * r * 0.55 + Math.cos(u * (complexity * 0.5 + 1)) * r * 0.25
        }
        const alpha = 0.22 + noise * 0.5
        ctx.fillStyle = i % 2 ? `rgba(103,232,249,${alpha})` : `rgba(196,181,253,${alpha})`
        ctx.beginPath()
        ctx.arc(x, y, 1 + noise * 2.4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [algorithm, animated, complexity, seed])

  return <div className="grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
    <div className="ops-panel p-5">
      <div className="flex items-center gap-3"><Sparkles className="size-5 text-violet-300"/><span className="font-mono text-[10px] font-black uppercase tracking-[.15em] text-violet-300">GENERATIVE 4D</span></div>
      <label className="mt-5 block text-xs font-bold text-zinc-300">{t.art.algorithm}
        <select className="ops-input mt-2" value={algorithm} onChange={(event) => setAlgorithm(event.target.value as ArtKey)}>
          {(Object.keys(t.art.algorithms) as ArtKey[]).map((key) => <option key={key} value={key}>{t.art.algorithms[key]}</option>)}
        </select>
      </label>
      <label className="mt-5 block text-xs font-bold text-zinc-300"><span className="flex justify-between"><span>{t.art.complexity}</span><span className="font-mono text-cyan-300">{complexity}</span></span>
        <input className="mt-3 w-full accent-violet-500" type="range" min="2" max="12" step="1" value={complexity} onChange={(event) => setComplexity(Number(event.target.value))}/>
      </label>
      <label className="mt-5 block text-xs font-bold text-zinc-300">{t.art.seed}
        <input className="ops-input mt-2" type="number" min="1" max="999999" value={seed} onChange={(event) => setSeed(Number(event.target.value) || 1)}/>
      </label>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" className="ops-button-primary" onClick={() => setAnimated((value) => !value)}>{animated ? <Pause className="size-4"/> : <Play className="size-4"/>}{t.art.animate}</button>
        <button type="button" className="ops-button-muted" onClick={() => setSeed(Math.floor(Math.random() * 999999) + 1)}><RefreshCcw className="size-4"/>{t.art.randomize}</button>
        <button type="button" className="ops-button-muted col-span-2" onClick={() => downloadCanvas(canvasRef.current, 'fourth-dimension-art.png')}><Download className="size-4"/>{t.common.download}</button>
      </div>
    </div>
    <div className="ops-panel p-3 md:p-5">
      <canvas ref={canvasRef} aria-label={t.art.canvas} className="h-[480px] w-full rounded-xl border border-white/[.07] bg-[#09090b]"/>
    </div>
  </div>
}

function Quest({ locale }: { locale: FourthDimensionLocale }) {
  const t = fourthDimensionLabCopy[locale]
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const questions = t.quest.questions
  const done = index >= questions.length
  const question = done ? null : questions[index]

  const restart = () => {
    setIndex(0)
    setScore(0)
    setSelected(null)
  }

  if (!question) {
    return <div className="ops-panel p-7 text-center md:p-10">
      <Trophy className="mx-auto size-9 text-amber-300"/>
      <p className="mt-4 font-mono text-xs font-black uppercase tracking-[.16em] text-amber-300">{t.quest.completed}</p>
      <h3 className="mt-3 text-3xl font-black text-white">{t.quest.result}: {score}/{questions.length}</h3>
      <button type="button" className="ops-button-primary mt-6" onClick={restart}><RefreshCcw className="size-4"/>{t.common.restart}</button>
    </div>
  }

  const correct = selected === question.correct
  return <div className="ops-panel overflow-hidden">
    <div className="flex items-center justify-between border-b border-white/[.07] p-5">
      <span className="font-mono text-xs font-black text-cyan-300">{t.quest.progress} {index + 1}/{questions.length}</span>
      <span className="ops-badge-good">{t.common.score}: {score}</span>
    </div>
    <div className="p-5 md:p-7">
      <h3 className="max-w-3xl text-xl font-black text-white md:text-2xl">{question.question}</h3>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {question.answers.map((answer, answerIndex) => {
          const chosen = selected === answerIndex
          const isCorrect = answerIndex === question.correct
          const className = selected === null
            ? 'rounded-xl border border-white/[.08] bg-white/[.025] p-4 text-left text-sm font-bold text-zinc-200 hover:border-blue-500/30 hover:bg-blue-500/[.06]'
            : isCorrect
              ? 'rounded-xl border border-emerald-500/30 bg-emerald-500/[.08] p-4 text-left text-sm font-bold text-emerald-200'
              : chosen
                ? 'rounded-xl border border-rose-500/30 bg-rose-500/[.08] p-4 text-left text-sm font-bold text-rose-200'
                : 'rounded-xl border border-white/[.05] bg-white/[.015] p-4 text-left text-sm font-bold text-zinc-600'
          return <button key={answer} type="button" disabled={selected !== null} className={className} onClick={() => { setSelected(answerIndex); if (answerIndex === question.correct) setScore((value) => value + 1) }}>{answer}</button>
        })}
      </div>
      {selected !== null ? <div className={correct ? 'mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/[.06] p-4' : 'mt-5 rounded-xl border border-amber-500/20 bg-amber-500/[.06] p-4'}>
        <p className="text-xs font-black uppercase tracking-wider text-zinc-300">{correct ? t.quest.correct : t.quest.incorrect}</p>
        <p className="mt-2 text-sm leading-6 text-zinc-300">{question.explanation}</p>
        <button type="button" className="ops-button-primary mt-4" onClick={() => { setIndex((value) => value + 1); setSelected(null) }}>{t.common.next}<ChevronRight className="size-4"/></button>
      </div> : null}
    </div>
  </div>
}

function Museum({ locale }: { locale: FourthDimensionLocale }) {
  const t = fourthDimensionLabCopy[locale]
  const [index, setIndex] = useState(0)
  const era = t.museum.eras[index]
  return <div className="ops-panel overflow-hidden">
    <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="border-b border-white/[.07] bg-[#0d0d0f] p-5 lg:border-b-0 lg:border-r">
        <p className="font-mono text-[10px] font-black uppercase tracking-[.16em] text-amber-300">{t.museum.era}</p>
        <p className="mt-3 font-mono text-4xl font-black text-white">{era[0]}</p>
        <div className="mt-6 space-y-2">
          {t.museum.eras.map(([year], eraIndex) => <button key={year} type="button" onClick={() => setIndex(eraIndex)} className={eraIndex === index ? 'w-full rounded-lg border border-amber-400/25 bg-amber-400/[.08] px-3 py-2 text-left font-mono text-xs font-black text-amber-200' : 'w-full rounded-lg border border-white/[.06] bg-white/[.02] px-3 py-2 text-left font-mono text-xs font-bold text-zinc-500 hover:text-zinc-200'}>{year}</button>)}
        </div>
      </div>
      <div className="flex min-h-[360px] flex-col justify-center p-6 md:p-10">
        <Activity className="size-6 text-amber-300"/>
        <h3 className="mt-5 text-2xl font-black text-white md:text-3xl">{era[1]}</h3>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 md:text-base">{era[2]}</p>
        <div className="mt-8 flex gap-2">
          <button type="button" className="ops-button-muted" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}><ChevronLeft className="size-4"/>{t.common.previous}</button>
          <button type="button" className="ops-button-primary" disabled={index === t.museum.eras.length - 1} onClick={() => setIndex((value) => Math.min(t.museum.eras.length - 1, value + 1))}>{t.common.next}<ChevronRight className="size-4"/></button>
        </div>
      </div>
    </div>
  </div>
}

function SectionHeading({ eyebrow, title, intro, icon: Icon }: { eyebrow: string; title: string; intro: string; icon: typeof Atom }) {
  return <div className="mb-7 max-w-4xl">
    <div className="flex items-center gap-2"><Icon className="size-4 text-violet-300"/><p className="font-mono text-xs font-black uppercase tracking-[.18em] text-violet-300">{eyebrow}</p></div>
    <h2 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">{title}</h2>
    <p className="mt-4 text-sm leading-7 text-zinc-300 md:text-base">{intro}</p>
  </div>
}

export function FourthDimensionLabSuite({ locale }: { locale: FourthDimensionLocale }) {
  const p = fourthDimensionPageCopy[locale]
  return <>
    <section id="galeria-4d" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
      <SectionHeading eyebrow={p.galleryEyebrow} title={p.galleryTitle} intro={p.galleryIntro} icon={Sparkles}/>
      <Gallery locale={locale}/>
    </section>

    <section id="cortes-4d" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
      <SectionHeading eyebrow={p.slicesEyebrow} title={p.slicesTitle} intro={p.slicesIntro} icon={Scissors}/>
      <SliceSimulator locale={locale}/>
    </section>

    <section id="laboratorio-4d" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
      <SectionHeading eyebrow={p.labEyebrow} title={p.labTitle} intro={p.labIntro} icon={FlaskConical}/>
      <EquationLab locale={locale}/>
    </section>

    <section id="relatividad" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
      <SectionHeading eyebrow={p.relativityEyebrow} title={p.relativityTitle} intro={p.relativityIntro} icon={Atom}/>
      <RelativityLab locale={locale}/>
    </section>

    <section id="arte-4d" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
      <SectionHeading eyebrow={p.artEyebrow} title={p.artTitle} intro={p.artIntro} icon={Sparkles}/>
      <ArtLab locale={locale}/>
    </section>

    <section id="juego-puzzles" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
      <SectionHeading eyebrow={p.questEyebrow} title={p.questTitle} intro={p.questIntro} icon={Trophy}/>
      <Quest locale={locale}/>
    </section>

    <section id="museo-4d" className="mx-auto w-full max-w-[1480px] scroll-mt-24 px-5 py-16 md:px-8">
      <SectionHeading eyebrow={p.museumEyebrow} title={p.museumTitle} intro={p.museumIntro} icon={Calculator}/>
      <Museum locale={locale}/>
    </section>
  </>
}
