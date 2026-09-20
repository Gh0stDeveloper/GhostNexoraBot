'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Pause, Play, RotateCcw } from 'lucide-react'
import Link from 'next/link'

const planets = [
  { name: 'Mercurio', radius: 3, orbit: 38, speed: 4.15, color: '#9d958c' },
  { name: 'Venus', radius: 5.2, orbit: 55, speed: 1.62, color: '#d7a95f' },
  { name: 'Tierra', radius: 5.6, orbit: 74, speed: 1, color: '#2f78c4', land: '#5f9f54' },
  { name: 'Marte', radius: 4.2, orbit: 94, speed: .53, color: '#b95635' },
  { name: 'Júpiter', radius: 11, orbit: 126, speed: .084, color: '#c9a37d' },
  { name: 'Saturno', radius: 9.5, orbit: 158, speed: .034, color: '#d8c18b', ring: true },
  { name: 'Urano', radius: 7.2, orbit: 188, speed: .012, color: '#79c9d1' },
  { name: 'Neptuno', radius: 7, orbit: 216, speed: .006, color: '#3866c5' },
]

function drawPlanet(ctx: CanvasRenderingContext2D, x: number, y: number, p: typeof planets[number], scale: number) {
  const r = p.radius * scale
  const g = ctx.createRadialGradient(x-r*.35,y-r*.4,r*.1,x,y,r)
  g.addColorStop(0,'#ffffff'); g.addColorStop(.18,p.color); g.addColorStop(1,'#11131a')
  if (p.ring) {
    ctx.save(); ctx.translate(x,y); ctx.scale(1,.28); ctx.strokeStyle='rgba(222,205,160,.7)'; ctx.lineWidth=Math.max(2,r*.55)
    ctx.beginPath(); ctx.arc(0,0,r*1.65,0,Math.PI*2); ctx.stroke(); ctx.restore()
  }
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill()
  if (p.name === 'Tierra') {
    ctx.fillStyle=p.land!; ctx.globalAlpha=.78
    ctx.beginPath(); ctx.ellipse(x-r*.15,y-r*.1,r*.3,r*.16,-.4,0,Math.PI*2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(x+r*.2,y+r*.2,r*.22,r*.34,.3,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1
  }
  if (p.name === 'Júpiter') {
    ctx.strokeStyle='rgba(111,62,42,.48)'; ctx.lineWidth=Math.max(1,r*.12)
    for(let i=-2;i<=2;i++){ctx.beginPath();ctx.arc(x,y+i*r*.23,Math.sqrt(Math.max(0,r*r-(i*r*.23)**2)),0,Math.PI);ctx.stroke()}
  }
}

export function NexoraCosmos() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [paused,setPaused]=useState(false)
  const pausedRef=useRef(false)
  useEffect(()=>{pausedRef.current=paused},[paused])
  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas)return
    const ctx=canvas.getContext('2d'); if(!ctx)return
    let frame=0, start=performance.now()
    const stars=Array.from({length:520},(_,i)=>({x:(i*73%997)/997,y:(i*191%991)/991,s:.35+(i%7)/8,a:.25+(i%9)/13}))
    const resize=()=>{const d=Math.min(devicePixelRatio,2);canvas.width=innerWidth*d;canvas.height=innerHeight*d;canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px';ctx.setTransform(d,0,0,d,0,0)}
    resize(); addEventListener('resize',resize)
    const draw=(now:number)=>{
      const w=innerWidth,h=innerHeight,t=(now-start)/1000
      ctx.fillStyle='#02040a';ctx.fillRect(0,0,w,h)
      const neb=ctx.createRadialGradient(w*.18,h*.2,0,w*.18,h*.2,w*.55);neb.addColorStop(0,'rgba(32,58,122,.20)');neb.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=neb;ctx.fillRect(0,0,w,h)
      stars.forEach((s,i)=>{ctx.globalAlpha=s.a*(.75+.25*Math.sin(t*.5+i));ctx.fillStyle=i%11===0?'#b9d8ff':'#fff';ctx.beginPath();ctx.arc(s.x*w,s.y*h,s.s,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1
      const mobile=w<700, scale=Math.min(w/(mobile?510:760),h/(mobile?650:610),1.25)
      const travel=pausedRef.current?0:t*.055
      const cx=w*.5+Math.sin(travel)*Math.min(w*.07,70), cy=h*.52+Math.cos(travel*.73)*Math.min(h*.045,35)
      ctx.save();ctx.translate(cx,cy);ctx.rotate(travel*.09)
      planets.forEach(p=>{ctx.strokeStyle='rgba(133,164,210,.12)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,p.orbit*scale,p.orbit*scale*.48,0,0,Math.PI*2);ctx.stroke()})
      const sunR=18*scale, sg=ctx.createRadialGradient(0,0,1,0,0,sunR*2.7);sg.addColorStop(0,'rgba(255,255,220,1)');sg.addColorStop(.28,'rgba(255,190,35,1)');sg.addColorStop(.58,'rgba(255,95,10,.5)');sg.addColorStop(1,'rgba(255,80,0,0)');ctx.fillStyle=sg;ctx.beginPath();ctx.arc(0,0,sunR*2.7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffc33b';ctx.beginPath();ctx.arc(0,0,sunR,0,Math.PI*2);ctx.fill()
      planets.forEach((p,i)=>{const a=(pausedRef.current?0:t)*p.speed*.22+i*.72;const x=Math.cos(a)*p.orbit*scale,y=Math.sin(a)*p.orbit*scale*.48;drawPlanet(ctx,x,y,p,scale)})
      ctx.restore()
      ctx.fillStyle='rgba(190,210,240,.48)';ctx.font='11px ui-monospace, monospace';ctx.fillText('SISTEMA SOLAR · MOVIMIENTO GALÁCTICO VISUALIZADO',18,h-22)
      frame=requestAnimationFrame(draw)
    }
    frame=requestAnimationFrame(draw)
    return()=>{cancelAnimationFrame(frame);removeEventListener('resize',resize)}
  },[])
  return <main className="relative h-dvh w-full overflow-hidden bg-black text-white">
    <canvas ref={canvasRef} className="absolute inset-0"/>
    <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4 sm:p-6">
      <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/45 p-4 backdrop-blur-xl">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.22em] text-blue-300">Nexora · Proyecto interactivo</p>
        <h1 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">Nexora Cosmos</h1>
        <p className="mt-1 max-w-md text-xs leading-5 text-zinc-300">Exploración visual 3D del Sistema Solar con rotación orbital y desplazamiento del sistema a través del espacio.</p>
      </div>
      <Link href="/" className="pointer-events-auto grid size-10 place-items-center rounded-xl border border-white/10 bg-black/45 backdrop-blur-xl" aria-label="Volver"><ArrowLeft className="size-4"/></Link>
    </header>
    <div className="absolute bottom-12 left-1/2 flex -translate-x-1/2 gap-2 rounded-2xl border border-white/10 bg-black/55 p-2 backdrop-blur-xl">
      <button onClick={()=>setPaused(v=>!v)} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-black">{paused?<Play className="size-4"/>:<Pause className="size-4"/>}{paused?'Continuar':'Pausar'}</button>
      <button onClick={()=>location.reload()} className="grid size-9 place-items-center rounded-xl border border-white/10 bg-white/5" aria-label="Reiniciar"><RotateCcw className="size-4"/></button>
    </div>
  </main>
}
