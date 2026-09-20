'use client'

import { useMemo, useRef } from 'react'
import { AdaptiveDpr, Line } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { PLANETS } from '../../lib/solar-system/bodies'
import { runtime } from '../../lib/solar-system/runtime'
import { stepPositions } from '../../lib/solar-system/step'
import { useSolar } from '../../lib/solar-system/store'
import { AsteroidBelt, OrbitPaths, Planet, Sun, Trails } from './celestial'
import { CameraRig } from './camera-rig'

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function ColoredStarField() {
  const geometry = useMemo(() => {
    const rand = seededRandom(90210)
    const count = 7600
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const palette = [
      new THREE.Color('#c7dcff'),
      new THREE.Color('#eef6ff'),
      new THREE.Color('#fff4d6'),
      new THREE.Color('#ffd69a'),
      new THREE.Color('#ffad7d'),
    ]

    for (let i = 0; i < count; i += 1) {
      const radius = 360 + rand() * 760
      const theta = rand() * Math.PI * 2
      const u = rand() * 2 - 1
      const phi = Math.acos(u)
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = radius * Math.cos(phi)
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)

      const base = palette[Math.min(palette.length - 1, Math.floor(rand() * palette.length))]!
      const brightness = 0.58 + rand() * 0.75
      colors[i * 3] = Math.min(1, base.r * brightness)
      colors[i * 3 + 1] = Math.min(1, base.g * brightness)
      colors[i * 3 + 2] = Math.min(1, base.b * brightness)
    }

    const result = new THREE.BufferGeometry()
    result.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    result.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return result
  }, [])

  const bandGeometry = useMemo(() => {
    const rand = seededRandom(445566)
    const count = 4200
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      const radius = 430 + rand() * 650
      const theta = rand() * Math.PI * 2
      const spread = (rand() - 0.5) * 88
      positions[i * 3] = Math.cos(theta) * radius
      positions[i * 3 + 1] = spread + Math.sin(theta * 3.1) * 16
      positions[i * 3 + 2] = Math.sin(theta) * radius
      const warm = rand()
      colors[i * 3] = 0.48 + warm * 0.32
      colors[i * 3 + 1] = 0.54 + warm * 0.22
      colors[i * 3 + 2] = 0.74 + (1 - warm) * 0.24
    }
    const result = new THREE.BufferGeometry()
    result.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    result.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return result
  }, [])

  return (
    <>
      <points geometry={geometry}>
        <pointsMaterial
          size={1.2}
          sizeAttenuation
          vertexColors
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
      <points geometry={bandGeometry} rotation={[0.34, 0, 0.1]}>
        <pointsMaterial
          size={1.45}
          sizeAttenuation
          vertexColors
          transparent
          opacity={0.28}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </>
  )
}

function RuntimeSync() {
  const { camera, size } = useThree()
  useFrame((_, delta) => {
    const d = Math.min(delta, 0.1)
    const { paused, speed } = useSolar.getState()
    if (!paused) runtime.days += speed * d
    stepPositions()
    runtime.camera = camera
    runtime.size.w = size.width
    runtime.size.h = size.height
  }, -10)
  return null
}

const _center = new THREE.Vector3()
const _targetPosition = new THREE.Vector3()

function GalacticMotion({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null)
  const phase = useRef(0)
  const show = useSolar((state) => state.showGalacticMotion)
  const motionSpeed = useSolar((state) => state.galacticSpeed)

  useFrame((_, delta) => {
    const node = group.current
    if (!node) return
    const d = Math.min(delta, 0.1)

    if (show) phase.current += d * 0.11 * motionSpeed
    const p = phase.current
    _targetPosition.set(
      show ? Math.sin(p) * 12 : 0,
      show ? Math.sin(p * 0.43) * 2.6 : 0,
      show ? Math.cos(p * 0.72) * 7 : 0,
    )

    const k = 1 - Math.exp(-2.5 * d)
    node.position.lerp(_targetPosition, k)
    node.rotation.y += (show ? 0.025 * motionSpeed : 0) * d
    node.rotation.z = THREE.MathUtils.lerp(node.rotation.z, show ? Math.sin(p * 0.6) * 0.035 : 0, k)
    node.updateMatrixWorld()
    node.getWorldPosition(_center)
    runtime.systemCenter.x = _center.x
    runtime.systemCenter.y = _center.y
    runtime.systemCenter.z = _center.z
    runtime.galacticPhase = p
  }, -5)

  return <group ref={group}>{children}</group>
}

function GalacticGuide() {
  const show = useSolar((state) => state.showGalacticMotion)
  const points = useMemo(() => {
    const result: [number, number, number][] = []
    for (let i = 0; i <= 160; i += 1) {
      const p = (i / 160) * Math.PI * 2
      result.push([Math.sin(p) * 12, Math.sin(p * 0.43) * 2.6, Math.cos(p * 0.72) * 7])
    }
    return result
  }, [])
  if (!show) return null
  return <Line points={points} color="#67e8f9" transparent opacity={0.09} lineWidth={0.65}/>
}

function Lights() {
  return (
    <>
      <color attach="background" args={['#02030a']} />
      <ambientLight intensity={0.075} color="#b7c9ef" />
      <hemisphereLight args={['#9fb9ff', '#160c08', 0.12]} />
      <directionalLight position={[-80, 42, -120]} intensity={0.035} color="#8eb8ff" />
    </>
  )
}

export function SolarCanvas() {
  return (
    <Canvas
      className="absolute inset-0 touch-none"
      camera={{ position: [36, 58, 188], fov: 42, near: 0.12, far: 3200 }}
      dpr={[1, 1.85]}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.24,
      }}
      onCreated={({ gl }) => {
        gl.setClearColor('#02030a')
        stepPositions()
      }}
      onPointerMissed={() => useSolar.getState().select(null)}
    >
      <AdaptiveDpr />
      <Lights />
      <ColoredStarField />
      <GalacticGuide />
      <RuntimeSync />
      <CameraRig />
      <GalacticMotion>
        <Sun />
        {PLANETS.map((planet) => <Planet key={planet.id} body={planet} />)}
        <OrbitPaths />
        <Trails />
        <AsteroidBelt />
      </GalacticMotion>
    </Canvas>
  )
}
