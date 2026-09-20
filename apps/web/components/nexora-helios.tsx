'use client'

import {
  Crosshair,
  Eye,
  EyeOff,
  Gauge,
  MousePointer2,
  Move3D,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Sparkles as SparklesIcon,
  Spline,
  SunMedium,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { AdaptiveDpr, Line, OrbitControls, Sparkles, Stars } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  HELIOS_AU_KM,
  HELIOS_BODY_BY_ID,
  HELIOS_GALILEAN,
  HELIOS_MOON,
  HELIOS_PLANETS,
  HELIOS_SUN,
  heliosDateFromDays,
  heliosDaysSinceJ2000,
  heliosDistanceAu,
  heliosOrbitCurve,
  heliosPosition,
  heliosSystemOffset,
  HELIOS_SYSTEM_TRAVEL_DIRECTION,
  type HeliosBody,
  type HeliosBodyId,
} from '../lib/nexora-helios-model'
import { nexoraHeliosCopy, type NexoraHeliosLocale } from '../lib/nexora-helios-i18n'
import {
  HELIOS_SUN_CORONA_FRAGMENT_SHADER,
  HELIOS_SUN_CORONA_VERTEX_SHADER,
} from '../lib/nexora-helios-shaders'
import {
  makeHeliosBumpTexture,
  makeHeliosCloudTexture,
  makeHeliosRingTexture,
  makeHeliosSunDetailTexture,
  makeHeliosTexture,
} from '../lib/nexora-helios-textures'

type RuntimePosition = { x: number; y: number; z: number }
type HeliosCameraMode = 'system' | 'sun' | 'body' | 'free'
type HeliosApproachLevel = 'orbit' | 'close' | 'inspect'

const runtime = {
  days: heliosDaysSinceJ2000(),
  travelSeconds: 0,
  camera: null as THREE.Camera | null,
  size: { width: 1, height: 1 },
  systemPosition: { x: 0, y: 0, z: 0 } as RuntimePosition,
  cameraDistance: 0,
  positions: {} as Partial<Record<HeliosBodyId, RuntimePosition>>,
}

const NAV_IDS: HeliosBodyId[] = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
]

const SPEED_MIN = 0.25
const SPEED_MAX = 4000
const SPEED_DEFAULT = 48
const TRAVEL_SPEED_MIN = 0.25
const TRAVEL_SPEED_MAX = 3
const TRAVEL_SPEED_DEFAULT = 1
const WORLD_TRAIL_SAMPLES = 72
const OVERVIEW = new THREE.Vector3(36, 58, 188)
const worldVector = new THREE.Vector3()

function useDeferredTexture(factory: () => THREE.Texture | null) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    let created: THREE.Texture | null = null
    const id = window.setTimeout(() => {
      created = factory()
      if (created) setTexture(created)
    }, 0)
    return () => {
      window.clearTimeout(id)
      created?.dispose()
    }
  }, [factory])
  return texture
}

function spinStep(body: HeliosBody, simulationDelta: number) {
  if (!body.rotationDays) return 0
  return simulationDelta / body.rotationDays * Math.PI * 2
}

function Atmosphere({
  radius,
  color,
  scale = 1.075,
  power = 2.5,
  intensity = 0.72,
}: {
  radius: number
  color: string
  scale?: number
  power?: number
  intensity?: number
}) {
  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(color) },
    uPower: { value: power },
    uIntensity: { value: intensity },
  }), [color, intensity, power])

  const vertexShader = useMemo(() => `
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vNormal = normalize(mat3(modelMatrix) * normal);
      vView = cameraPosition - world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `, [])

  const fragmentShader = useMemo(() => `
    uniform vec3 uColor;
    uniform float uPower;
    uniform float uIntensity;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vec3 n = normalize(vNormal);
      vec3 v = normalize(vView);
      float fresnel = pow(1.0 - abs(dot(n, v)), uPower);
      gl_FragColor = vec4(uColor, fresnel * uIntensity);
    }
  `, [])

  return <mesh scale={scale}>
    <sphereGeometry args={[radius, 36, 36]}/>
    <shaderMaterial
      uniforms={uniforms}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      transparent
      depthWrite={false}
      blending={THREE.AdditiveBlending}
      side={THREE.FrontSide}
    />
  </mesh>
}

function SunCorona({ radius }: { radius: number }) {
  const material = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uInner: { value: new THREE.Color('#fff7d8') },
    uMid: { value: new THREE.Color('#ffca63') },
    uOuter: { value: new THREE.Color('#ff6b1a') },
  }), [])

  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.uTime.value = clock.getElapsedTime()
  })

  return <mesh scale={1.22}>
    <sphereGeometry args={[radius, 48, 48]}/>
    <shaderMaterial
      ref={material}
      uniforms={uniforms}
      transparent
      depthWrite={false}
      blending={THREE.AdditiveBlending}
      side={THREE.BackSide}
      vertexShader={HELIOS_SUN_CORONA_VERTEX_SHADER}
      fragmentShader={HELIOS_SUN_CORONA_FRAGMENT_SHADER}
    />
  </mesh>
}

function FocusRing({ radius, color }: { radius: number; color: string }) {
  const points = useMemo(() => {
    const out: [number, number, number][] = []
    for (let index = 0; index <= 80; index += 1) {
      const angle = index / 80 * Math.PI * 2
      out.push([Math.cos(angle) * radius, 0, Math.sin(angle) * radius])
    }
    return out
  }, [radius])
  return <Line points={points} color={color} lineWidth={1.25} transparent opacity={0.75}/>
}

function HitSphere({
  radius,
  id,
  onSelect,
  onHover,
}: {
  radius: number
  id: HeliosBodyId
  onSelect: (id: HeliosBodyId) => void
  onHover: (id: HeliosBodyId | null) => void
}) {
  return <mesh
    visible={false}
    onClick={(event) => {
      event.stopPropagation()
      onSelect(id)
    }}
    onPointerOver={(event) => {
      event.stopPropagation()
      onHover(id)
      document.body.style.cursor = 'pointer'
    }}
    onPointerOut={() => {
      onHover(null)
      document.body.style.cursor = ''
    }}
  >
    <sphereGeometry args={[Math.max(radius * 1.9, 1.55), 16, 16]}/>
  </mesh>
}

function Sun({
  selected,
  paused,
  speed,
  onSelect,
  onHover,
}: {
  selected: boolean
  paused: boolean
  speed: number
  onSelect: (id: HeliosBodyId) => void
  onHover: (id: HeliosBodyId | null) => void
}) {
  const root = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Mesh>(null)
  const textureFactory = useMemo(() => () => makeHeliosSunDetailTexture(), [])
  const texture = useDeferredTexture(textureFactory)

  useFrame((_, delta) => {
    if (!root.current) return
    root.current.getWorldPosition(worldVector)
    runtime.positions.sun = { x: worldVector.x, y: worldVector.y, z: worldVector.z }
    if (!paused && spin.current) {
      spin.current.rotation.y += spinStep(HELIOS_SUN, speed * Math.min(delta, 0.1))
    }
  })

  return <group ref={root}>
    <mesh
      ref={spin}
      onClick={(event) => {
        event.stopPropagation()
        onSelect('sun')
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        onHover('sun')
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        onHover(null)
        document.body.style.cursor = ''
      }}
    >
      <sphereGeometry args={[HELIOS_SUN.visualRadius, 80, 80]}/>
      <meshBasicMaterial
        map={texture}
        color={texture ? '#fffdf4' : '#fff2c0'}
        toneMapped={false}
      />
    </mesh>

    <SunCorona radius={HELIOS_SUN.visualRadius}/>
    <mesh scale={1.055}>
      <sphereGeometry args={[HELIOS_SUN.visualRadius, 56, 56]}/>
      <meshBasicMaterial color="#fff0b8" transparent opacity={0.17} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false}/>
    </mesh>
    <mesh scale={1.17}>
      <sphereGeometry args={[HELIOS_SUN.visualRadius, 44, 44]}/>
      <meshBasicMaterial color="#ffad42" transparent opacity={0.11} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false}/>
    </mesh>
    <mesh scale={1.42}>
      <sphereGeometry args={[HELIOS_SUN.visualRadius, 36, 36]}/>
      <meshBasicMaterial color="#ff6a1a" transparent opacity={0.045} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false}/>
    </mesh>
    <pointLight color="#fff4d6" intensity={168} distance={720} decay={1.78}/>
    <pointLight color="#ff9d3b" intensity={32} distance={210} decay={1.45}/>
    {selected ? <FocusRing radius={HELIOS_SUN.visualRadius * 1.28} color="#fff2cc"/> : null}
  </group>
}

function Planet({
  body,
  selected,
  paused,
  speed,
  onSelect,
  onHover,
}: {
  body: HeliosBody
  selected: boolean
  paused: boolean
  speed: number
  onSelect: (id: HeliosBodyId) => void
  onHover: (id: HeliosBodyId | null) => void
}) {
  const group = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const mapFactory = useMemo(() => () => makeHeliosTexture(body.id), [body.id])
  const cloudFactory = useMemo(() => () => body.id === 'earth' ? makeHeliosCloudTexture() : null, [body.id])
  const bumpFactory = useMemo(() => () => makeHeliosBumpTexture(body.id), [body.id])
  const ringFactory = useMemo(() => () => body.rings ? makeHeliosRingTexture(body.id === 'uranus') : null, [body.id, body.rings])
  const map = useDeferredTexture(mapFactory)
  const cloudMap = useDeferredTexture(cloudFactory)
  const bumpMap = useDeferredTexture(bumpFactory)
  const ringMap = useDeferredTexture(ringFactory)
  const tilt = body.obliquity * Math.PI / 180

  useFrame((_, delta) => {
    if (!group.current || !body.orbit) return
    const [x, y, z] = heliosPosition(body.orbit, runtime.days)
    group.current.position.set(x, y, z)
    group.current.getWorldPosition(worldVector)
    runtime.positions[body.id] = { x: worldVector.x, y: worldVector.y, z: worldVector.z }
    if (!paused && spin.current) {
      spin.current.rotation.y += spinStep(body, speed * Math.min(delta, 0.1))
    }
  })

  return <group ref={group}>
    <group rotation={[0, 0, tilt]}>
      <group ref={spin}>
        <mesh>
          <sphereGeometry args={[body.visualRadius, 64, 64]}/>
          <meshStandardMaterial
            map={map}
            bumpMap={bumpMap ?? undefined}
            bumpScale={body.id === 'earth' ? 0.035 : body.id === 'mars' ? 0.055 : 0.065}
            color={map ? '#ffffff' : body.color}
            roughness={body.roughness}
            metalness={body.metalness}
          />
        </mesh>

        {body.id === 'earth' && cloudMap ? <mesh>
          <sphereGeometry args={[body.visualRadius * 1.019, 64, 64]}/>
          <meshStandardMaterial
            map={cloudMap}
            transparent
            depthWrite={false}
            roughness={0.94}
            metalness={0}
          />
        </mesh> : null}
      </group>

      {body.atmosphere ? <Atmosphere
        radius={body.visualRadius}
        color={body.atmosphere}
        scale={body.id === 'venus' ? 1.055 : 1.075}
        intensity={body.id === 'earth' ? 0.88 : 0.64}
      /> : null}

      {body.rings && ringMap ? <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[body.visualRadius * body.rings.inner, body.visualRadius * body.rings.outer, 128]}/>
        <meshStandardMaterial
          map={ringMap}
          side={THREE.DoubleSide}
          transparent
          opacity={body.rings.opacity}
          alphaTest={0.018}
          depthWrite={false}
          roughness={0.62}
          metalness={0.035}
        />
      </mesh> : null}
    </group>

    <HitSphere radius={body.visualRadius} id={body.id} onSelect={onSelect} onHover={onHover}/>
    {selected ? <FocusRing radius={body.visualRadius * 1.6} color={body.color}/> : null}
    {body.id === 'earth' ? <Moon paused={paused} speed={speed} onSelect={onSelect} onHover={onHover}/> : null}
    {body.id === 'jupiter' ? <GalileanMoons/> : null}
  </group>
}

function Moon({
  paused,
  speed,
  onSelect,
  onHover,
}: {
  paused: boolean
  speed: number
  onSelect: (id: HeliosBodyId) => void
  onHover: (id: HeliosBodyId | null) => void
}) {
  const group = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Mesh>(null)
  const textureFactory = useMemo(() => () => makeHeliosTexture('moon'), [])
  const texture = useDeferredTexture(textureFactory)

  useFrame((_, delta) => {
    if (!group.current || !HELIOS_MOON.orbit) return
    const angle = Math.PI * 2 / HELIOS_MOON.orbit.periodDays * runtime.days
    const distance = 0.86 * 2.72
    const inclination = HELIOS_MOON.orbit.i * Math.PI / 180
    group.current.position.set(
      Math.cos(angle) * distance,
      Math.sin(angle) * distance * Math.sin(inclination),
      Math.sin(angle) * distance,
    )
    group.current.getWorldPosition(worldVector)
    runtime.positions.moon = { x: worldVector.x, y: worldVector.y, z: worldVector.z }
    if (!paused && spin.current) {
      spin.current.rotation.y += spinStep(HELIOS_MOON, speed * Math.min(delta, 0.1))
    }
  })

  return <group ref={group}>
    <mesh
      ref={spin}
      onClick={(event) => {
        event.stopPropagation()
        onSelect('moon')
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        onHover('moon')
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        onHover(null)
        document.body.style.cursor = ''
      }}
    >
      <sphereGeometry args={[HELIOS_MOON.visualRadius, 32, 32]}/>
      <meshStandardMaterial map={texture} color={texture ? '#ffffff' : HELIOS_MOON.color} roughness={0.96} metalness={0.03}/>
    </mesh>
  </group>
}

function GalileanMoons() {
  const refs = useRef<(THREE.Group | null)[]>([])

  useFrame(() => {
    HELIOS_GALILEAN.forEach((moon, index) => {
      const group = refs.current[index]
      if (!group) return
      const angle = Math.PI * 2 / moon.periodDays * runtime.days + index * 0.42
      group.position.set(
        Math.cos(angle) * moon.distance,
        Math.sin(angle * 0.55) * 0.055,
        Math.sin(angle) * moon.distance,
      )
    })
  })

  return <group>
    {HELIOS_GALILEAN.map((moon, index) => <group
      key={moon.id}
      ref={(element) => {
        refs.current[index] = element
      }}
    >
      <mesh>
        <sphereGeometry args={[moon.radius, 16, 16]}/>
        <meshStandardMaterial color={moon.color} roughness={0.72} metalness={0.03}/>
      </mesh>
    </group>)}
  </group>
}

function OrbitPaths({ show }: { show: boolean }) {
  const curves = useMemo(() => HELIOS_PLANETS.flatMap((body) => body.orbit ? [{
    id: body.id,
    color: body.color,
    points: heliosOrbitCurve(body.orbit),
  }] : []), [])

  if (!show) return null
  return <group>
    {curves.map((curve) => <Line
      key={curve.id}
      points={curve.points}
      color={curve.color}
      lineWidth={1}
      transparent
      opacity={0.4}
    />)}
  </group>
}

function WorldTrailLine({
  body,
  orbitalSpeed,
  travelSpeed,
  galacticMotion,
}: {
  body: HeliosBody
  orbitalSpeed: number
  travelSpeed: number
  galacticMotion: boolean
}) {
  const object = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WORLD_TRAIL_SAMPLES * 3), 3))
    const material = new THREE.LineBasicMaterial({
      color: body.color,
      transparent: true,
      opacity: body.id === 'sun' ? 0.78 : 0.58,
    })
    return new THREE.Line(geometry, material)
  }, [body.color, body.id])

  useEffect(() => () => {
    object.geometry.dispose()
    ;(object.material as THREE.Material).dispose()
  }, [object])

  useFrame(() => {
    const position = object.geometry.getAttribute('position')
    const periodSeconds = body.orbit ? body.orbit.periodDays / Math.max(orbitalSpeed, 0.01) : 18
    const spanSeconds = Math.min(32, Math.max(10, periodSeconds * 0.62))

    for (let index = 0; index < WORLD_TRAIL_SAMPLES; index += 1) {
      const ageSeconds = spanSeconds * (1 - index / (WORLD_TRAIL_SAMPLES - 1))
      const sampleDays = runtime.days - ageSeconds * orbitalSpeed
      const sampleTravel = Math.max(0, runtime.travelSeconds - ageSeconds * travelSpeed)
      const offset = galacticMotion ? heliosSystemOffset(sampleTravel) : [0, 0, 0] as const
      const local = body.orbit ? heliosPosition(body.orbit, sampleDays) : [0, 0, 0] as const
      position.setXYZ(
        index,
        local[0] + offset[0],
        local[1] + offset[1],
        local[2] + offset[2],
      )
    }
    position.needsUpdate = true
  })

  return <primitive object={object}/>
}

function WorldTrails({
  show,
  orbitalSpeed,
  travelSpeed,
  galacticMotion,
}: {
  show: boolean
  orbitalSpeed: number
  travelSpeed: number
  galacticMotion: boolean
}) {
  if (!show) return null
  return <group>
    {[HELIOS_SUN, ...HELIOS_PLANETS].map((body) => <WorldTrailLine
      key={body.id}
      body={body}
      orbitalSpeed={orbitalSpeed}
      travelSpeed={travelSpeed}
      galacticMotion={galacticMotion}
    />)}
  </group>
}

function AsteroidBelt() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const count = 520
  const asteroids = useMemo(() => {
    let seed = 2026
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    return Array.from({ length: count }, () => ({
      a: 2.08 + random() * 1.45,
      e: 0.015 + random() * 0.16,
      i: (random() - 0.5) * 18,
      Omega: random() * 360,
      w: random() * 360,
      M0: random() * 360,
      periodDays: 1180 + random() * 1500,
      scale: 0.028 + random() * 0.075,
      rx: random() * Math.PI,
      ry: random() * Math.PI,
    }))
  }, [])
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(() => {
    if (!mesh.current) return
    asteroids.forEach((asteroid, index) => {
      const [x, y, z] = heliosPosition(asteroid, runtime.days)
      dummy.position.set(x, y, z)
      dummy.rotation.set(asteroid.rx, asteroid.ry, asteroid.i)
      dummy.scale.setScalar(asteroid.scale)
      dummy.updateMatrix()
      mesh.current?.setMatrixAt(index, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
    <icosahedronGeometry args={[1, 0]}/>
    <meshStandardMaterial color="#897c71" roughness={0.96} metalness={0.04}/>
  </instancedMesh>
}

function MilkyWayBand() {
  const object = useMemo(() => {
    const count = 2400
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    let seed = 9182
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3
      const angle = random() * Math.PI * 2
      const radius = 360 + random() * 430
      positions[offset] = Math.cos(angle) * radius
      positions[offset + 1] = (random() - 0.5) * 55 + Math.sin(angle * 2.2) * 18
      positions[offset + 2] = Math.sin(angle) * radius

      const palette = random()
      const color = palette < 0.2
        ? new THREE.Color('#ffd8a8')
        : palette < 0.55
          ? new THREE.Color('#a8c7ff')
          : new THREE.Color('#f3edff')
      colors[offset] = color.r
      colors[offset + 1] = color.g
      colors[offset + 2] = color.b
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const material = new THREE.PointsMaterial({
      size: 1.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    const points = new THREE.Points(geometry, material)
    points.rotation.set(0.12, 0.28, -0.16)
    return points
  }, [])

  useEffect(() => () => {
    object.geometry.dispose()
    ;(object.material as THREE.Material).dispose()
  }, [object])

  return <primitive object={object}/>
}

function DeepSpaceColorField() {
  const object = useMemo(() => {
    const count = 3600
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    let seed = 42026
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }

    const palette = [
      new THREE.Color('#b8d4ff'),
      new THREE.Color('#e8f1ff'),
      new THREE.Color('#fff4d8'),
      new THREE.Color('#ffd3a6'),
      new THREE.Color('#d7c8ff'),
    ]

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3
      const radius = 250 + random() * 1050
      const theta = random() * Math.PI * 2
      const phi = Math.acos(2 * random() - 1)
      positions[offset] = Math.sin(phi) * Math.cos(theta) * radius
      positions[offset + 1] = Math.cos(phi) * radius
      positions[offset + 2] = Math.sin(phi) * Math.sin(theta) * radius

      const base = palette[Math.floor(random() * palette.length)] ?? palette[0]
      const brightness = 0.58 + random() * 0.42
      colors[offset] = base.r * brightness
      colors[offset + 1] = base.g * brightness
      colors[offset + 2] = base.b * brightness
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const material = new THREE.PointsMaterial({
      size: 1.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    return new THREE.Points(geometry, material)
  }, [])

  useEffect(() => () => {
    object.geometry.dispose()
    ;(object.material as THREE.Material).dispose()
  }, [object])

  return <primitive object={object}/>
}

function GalacticStarFlow({ enabled }: { enabled: boolean }) {
  const object = useMemo(() => {
    const count = 760
    const positions = new Float32Array(count * 3)
    let seed = 7717
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3
      positions[offset] = (random() - 0.5) * 360
      positions[offset + 1] = (random() - 0.5) * 220
      positions[offset + 2] = (random() - 0.5) * 760
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: '#9fd9ff',
      size: 0.8,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return new THREE.Points(geometry, material)
  }, [])

  useEffect(() => () => {
    object.geometry.dispose()
    ;(object.material as THREE.Material).dispose()
  }, [object])

  useFrame((_, delta) => {
    if (!enabled) return
    const position = object.geometry.getAttribute('position')
    const velocity = delta * 16
    for (let index = 0; index < position.count; index += 1) {
      let x = position.getX(index) - HELIOS_SYSTEM_TRAVEL_DIRECTION[0] * velocity
      let y = position.getY(index) - HELIOS_SYSTEM_TRAVEL_DIRECTION[1] * velocity
      let z = position.getZ(index) - HELIOS_SYSTEM_TRAVEL_DIRECTION[2] * velocity
      if (x < -180) x += 360
      if (x > 180) x -= 360
      if (y < -110) y += 220
      if (y > 110) y -= 220
      if (z < -380) z += 760
      if (z > 380) z -= 760
      position.setXYZ(index, x, y, z)
    }
    position.needsUpdate = true
  })

  return <primitive object={object}/>
}

function SystemMotion({
  enabled,
  children,
}: {
  enabled: boolean
  children: React.ReactNode
}) {
  const group = useRef<THREE.Group>(null)
  const target = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    if (!group.current) return
    const offset = enabled ? heliosSystemOffset(runtime.travelSeconds) : [0, 0, 0] as const
    target.set(offset[0], offset[1], offset[2])
    const amount = 1 - Math.exp(-4.5 * Math.min(delta, 0.1))
    group.current.position.lerp(target, amount)
    runtime.systemPosition = {
      x: group.current.position.x,
      y: group.current.position.y,
      z: group.current.position.z,
    }
  })

  return <group ref={group}>{children}</group>
}

function RuntimeSync({
  paused,
  orbitalSpeed,
  travelSpeed,
  galacticMotion,
}: {
  paused: boolean
  orbitalSpeed: number
  travelSpeed: number
  galacticMotion: boolean
}) {
  const { camera, size } = useThree()

  useFrame((_, delta) => {
    const step = Math.min(delta, 0.1)
    if (!paused) {
      runtime.days += orbitalSpeed * step
      if (galacticMotion) runtime.travelSeconds += step * travelSpeed
    }
    runtime.camera = camera
    runtime.size.width = size.width
    runtime.size.height = size.height
  })

  return null
}

function bodyApproachDistance(id: HeliosBodyId, level: HeliosApproachLevel) {
  const body = HELIOS_BODY_BY_ID[id]
  if (level === 'orbit') {
    if (id === 'sun') return 15
    if (id === 'jupiter' || id === 'saturn') return body.visualRadius * 6.6
    return Math.max(body.visualRadius * 7.8, 5.6)
  }

  if (id === 'sun') return level === 'close' ? HELIOS_SUN.visualRadius * 3.1 : HELIOS_SUN.visualRadius * 1.85

  if (body.rings) {
    const ringEdge = body.visualRadius * body.rings.outer
    return level === 'close' ? ringEdge * 1.85 : ringEdge * 1.18
  }

  if (level === 'close') {
    return Math.max(body.visualRadius * 3.05, body.visualRadius + 0.82)
  }

  return Math.max(body.visualRadius * 1.38, body.visualRadius + 0.11)
}

function bodyMinimumCameraDistance(id: HeliosBodyId) {
  const body = HELIOS_BODY_BY_ID[id]
  if (id === 'sun') return HELIOS_SUN.visualRadius * 1.6
  if (body.rings) return body.visualRadius * body.rings.outer * 1.08
  return Math.max(body.visualRadius * 1.16, body.visualRadius + 0.065)
}

function cameraFov(mode: HeliosCameraMode, level: HeliosApproachLevel) {
  if (mode === 'system' || mode === 'free') return 42
  if (level === 'inspect') return 27
  if (level === 'close') return 33
  return 40
}

function CameraRig({
  selectedId,
  mode,
  approachLevel,
}: {
  selectedId: HeliosBodyId | null
  mode: HeliosCameraMode
  approachLevel: HeliosApproachLevel
}) {
  const controls = useRef<any>(null)
  const previous = useRef('')
  const arriving = useRef(false)
  const destination = useRef(new THREE.Vector3())
  const goal = useRef(new THREE.Vector3())
  const direction = useRef(new THREE.Vector3())
  const shift = useRef(new THREE.Vector3())
  const focusDistance = useRef(1)
  const { camera } = useThree()

  useEffect(() => {
    const key = `${mode}:${selectedId ?? 'none'}:${approachLevel}`
    if (previous.current === key) return
    previous.current = key

    if (mode === 'free') {
      arriving.current = false
      return
    }

    arriving.current = true
    const focusId = mode === 'sun' ? 'sun' : mode === 'body' ? selectedId : null
    const system = runtime.systemPosition
    const position = focusId ? runtime.positions[focusId] : system
    destination.current.set(position?.x ?? 0, position?.y ?? 0, position?.z ?? 0)

    if (focusId) {
      const currentTarget = controls.current?.target ?? destination.current
      direction.current.copy(camera.position).sub(currentTarget)
      if (direction.current.lengthSq() < 1e-6) direction.current.set(0.55, 0.36, 0.76)
      direction.current.normalize()
      focusDistance.current = bodyApproachDistance(focusId, approachLevel)
      goal.current.copy(destination.current).addScaledVector(direction.current, focusDistance.current)
    } else {
      direction.current.copy(OVERVIEW).normalize()
      focusDistance.current = OVERVIEW.length()
      goal.current.copy(destination.current).add(OVERVIEW)
    }
  }, [approachLevel, camera, mode, selectedId])

  useFrame((_, delta) => {
    const controlsInstance = controls.current
    if (!controlsInstance) return

    const targetFov = cameraFov(mode, approachLevel)
    if (camera instanceof THREE.PerspectiveCamera) {
      const amount = 1 - Math.exp(-4 * Math.min(delta, 0.1))
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, amount)
      camera.updateProjectionMatrix()
    }

    if (mode === 'free') {
      runtime.cameraDistance = camera.position.distanceTo(controlsInstance.target)
      controlsInstance.update()
      return
    }

    const focusId = mode === 'sun' ? 'sun' : mode === 'body' ? selectedId : null
    const system = runtime.systemPosition
    const position = focusId ? runtime.positions[focusId] : system
    destination.current.set(position?.x ?? 0, position?.y ?? 0, position?.z ?? 0)

    if (focusId) {
      focusDistance.current = bodyApproachDistance(focusId, approachLevel)
    }

    if (arriving.current) {
      if (focusId) {
        goal.current.copy(destination.current).addScaledVector(direction.current, focusDistance.current)
      } else {
        goal.current.copy(destination.current).add(OVERVIEW)
      }

      const distance = camera.position.distanceTo(goal.current)
      const flightRate = distance > 80 ? 1.9 : distance > 20 ? 2.45 : 3.35
      const amount = 1 - Math.exp(-flightRate * Math.min(delta, 0.1))
      controlsInstance.target.lerp(destination.current, amount)
      camera.position.lerp(goal.current, amount)

      if (
        controlsInstance.target.distanceTo(destination.current) < 0.045 &&
        camera.position.distanceTo(goal.current) < 0.11
      ) {
        arriving.current = false
      }
    } else {
      shift.current.copy(destination.current).sub(controlsInstance.target)
      camera.position.add(shift.current)
      controlsInstance.target.copy(destination.current)
    }

    runtime.cameraDistance = camera.position.distanceTo(controlsInstance.target)
    controlsInstance.update()
  })

  const focusId = mode === 'sun' ? 'sun' : mode === 'body' ? selectedId : null
  const minDistance = focusId ? bodyMinimumCameraDistance(focusId) : 1.45

  return <OrbitControls
    ref={controls}
    enableDamping
    dampingFactor={0.075}
    minDistance={minDistance}
    maxDistance={520}
    enablePan={approachLevel === 'orbit' || mode === 'free' || mode === 'system'}
    makeDefault
    zoomSpeed={approachLevel === 'inspect' ? 0.48 : 0.82}
    rotateSpeed={approachLevel === 'inspect' ? 0.48 : 0.7}
  />
}

function SolarScene({
  paused,
  speed,
  travelSpeed,
  cameraMode,
  approachLevel,
  selectedId,
  showOrbits,
  showTrails,
  galacticMotion,
  onSelect,
  onHover,
}: {
  paused: boolean
  speed: number
  travelSpeed: number
  cameraMode: HeliosCameraMode
  approachLevel: HeliosApproachLevel
  selectedId: HeliosBodyId | null
  showOrbits: boolean
  showTrails: boolean
  galacticMotion: boolean
  onSelect: (id: HeliosBodyId) => void
  onHover: (id: HeliosBodyId | null) => void
}) {
  return <>
    <color attach="background" args={['#01030a']}/>
    <fog attach="fog" args={['#01030a', 500, 1500]}/>
    <ambientLight intensity={0.075} color="#a9c5ff"/>
    <hemisphereLight args={['#7fa9ff', '#241308', 0.105]}/>

    <Stars radius={760} depth={260} count={11000} factor={4.5} saturation={0.72} fade speed={0.16}/>
    <DeepSpaceColorField/>
    <Sparkles count={520} scale={[760, 470, 760]} size={1.7} speed={0.07} color="#91d9ff" opacity={0.3}/>
    <Sparkles count={290} scale={[700, 410, 700]} size={1.35} speed={0.045} color="#ffd6a0" opacity={0.22}/>
    <MilkyWayBand/>
    <GalacticStarFlow enabled={galacticMotion}/>

    <RuntimeSync paused={paused} orbitalSpeed={speed} travelSpeed={travelSpeed} galacticMotion={galacticMotion}/>
    <CameraRig selectedId={selectedId} mode={cameraMode} approachLevel={approachLevel}/>

    <SystemMotion enabled={galacticMotion}>
      <Sun
        selected={selectedId === 'sun'}
        paused={paused}
        speed={speed}
        onSelect={onSelect}
        onHover={onHover}
      />
      {HELIOS_PLANETS.map((body) => <Planet
        key={body.id}
        body={body}
        selected={selectedId === body.id}
        paused={paused}
        speed={speed}
        onSelect={onSelect}
        onHover={onHover}
      />)}
      <OrbitPaths show={showOrbits}/>
      <AsteroidBelt/>
    </SystemMotion>

    <WorldTrails
      show={showTrails}
      orbitalSpeed={speed}
      travelSpeed={travelSpeed}
      galacticMotion={galacticMotion}
    />
  </>
}

function SolarCanvas(props: Parameters<typeof SolarScene>[0]) {
  return <Canvas
    className="absolute inset-0 touch-none"
    camera={{ position: [36, 58, 188], fov: 42, near: 0.025, far: 3000 }}
    dpr={[1, 1.8]}
    gl={{
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 1.28,
    }}
    onCreated={({ gl }) => {
      gl.setClearColor('#02040a')
    }}
  >
    <AdaptiveDpr/>
    <SolarScene {...props}/>
  </Canvas>
}

function PlanetLabels({
  locale,
  visible,
  selectedId,
  hoveredId,
}: {
  locale: NexoraHeliosLocale
  visible: boolean
  selectedId: HeliosBodyId | null
  hoveredId: HeliosBodyId | null
}) {
  const copy = nexoraHeliosCopy[locale]

  useEffect(() => {
    if (!visible) return
    let frame = 0
    const projected = new THREE.Vector3()

    const loop = () => {
      const camera = runtime.camera
      if (camera) {
        camera.updateMatrixWorld()
        const placed: { x: number; y: number }[] = []
        let sunX = 0
        let sunY = 0

        for (const id of NAV_IDS) {
          const element = document.getElementById(`nexora-helios-label-${id}`)
          const position = runtime.positions[id]
          if (!element || !position) continue

          projected.set(position.x, position.y, position.z).project(camera)
          const onScreen = projected.z < 1 && projected.x > -1.15 && projected.x < 1.15 && projected.y > -1.15 && projected.y < 1.15
          const x = (projected.x * 0.5 + 0.5) * runtime.size.width
          const y = (-projected.y * 0.5 + 0.5) * runtime.size.height

          if (id === 'sun') {
            sunX = x
            sunY = y
          }

          let crowded = false
          if (id !== 'sun') {
            if (Math.hypot(x - sunX, y - sunY) < 42) crowded = true
            for (const placedPoint of placed) {
              if (Math.hypot(x - placedPoint.x, y - placedPoint.y) < 30) crowded = true
            }
          }

          const active = id === selectedId || id === hoveredId
          element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -135%)`
          element.style.opacity = !onScreen || (crowded && !active) ? '0' : active ? '1' : '0.8'
          if (!crowded && onScreen) placed.push({ x, y })
        }
      }
      frame = requestAnimationFrame(loop)
    }

    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [hoveredId, selectedId, visible])

  if (!visible) return null

  return <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
    {NAV_IDS.map((id) => <div
      key={id}
      id={`nexora-helios-label-${id}`}
      className="absolute left-0 top-0 rounded-full border border-white/10 bg-black/55 px-2 py-1 text-[9px] font-black uppercase tracking-[.13em] text-white opacity-0 shadow-[0_0_18px_rgba(0,0,0,.65)] backdrop-blur-md"
    >
      {copy.bodies[id].name}
    </div>)}
  </div>
}

function formatNumber(locale: NexoraHeliosLocale, value: number, digits = 2) {
  return value.toLocaleString(locale === 'es' ? 'es-MX' : 'en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
}

function superscript(value: number) {
  const map: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
  }
  return String(value).split('').map((character) => map[character] ?? character).join('')
}

function formatDays(locale: NexoraHeliosLocale, days: number) {
  const t = nexoraHeliosCopy[locale].stats
  const absolute = Math.abs(days)
  if (absolute < 1) {
    const hours = absolute * 24
    if (hours < 1) return `${formatNumber(locale, hours * 60, 0)} ${t.minutes}`
    return `${formatNumber(locale, hours, 1)} ${t.hours}`
  }
  if (absolute < 365) return `${formatNumber(locale, absolute, absolute >= 10 ? 1 : 2)} ${t.days}`
  return `${formatNumber(locale, absolute / 365.25, absolute >= 3650 ? 1 : 2)} ${t.years}`
}

function speedToSlider(speed: number) {
  const minimum = Math.log10(SPEED_MIN)
  const maximum = Math.log10(SPEED_MAX)
  return (Math.log10(speed) - minimum) / (maximum - minimum) * 100
}

function sliderToSpeed(value: number) {
  const minimum = Math.log10(SPEED_MIN)
  const maximum = Math.log10(SPEED_MAX)
  return 10 ** (minimum + value / 100 * (maximum - minimum))
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
  return <button
    type="button"
    aria-label={label}
    aria-pressed={pressed}
    onClick={onClick}
    className={pressed
      ? 'grid size-10 shrink-0 place-items-center rounded-xl border border-blue-400/30 bg-blue-500/15 text-blue-200 backdrop-blur-xl transition active:scale-95'
      : 'grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/45 text-zinc-400 backdrop-blur-xl transition hover:text-white active:scale-95'}
  >
    {children}
  </button>
}

function BodyInfo({
  locale,
  id,
  approachLevel,
  onApproachChange,
  onClose,
}: {
  locale: NexoraHeliosLocale
  id: HeliosBodyId
  approachLevel: HeliosApproachLevel
  onApproachChange: (level: HeliosApproachLevel) => void
  onClose: () => void
}) {
  const copy = nexoraHeliosCopy[locale]
  const body = HELIOS_BODY_BY_ID[id]
  const bodyCopy = copy.bodies[id]
  const rows: [string, string][] = [
    [copy.stats.class, bodyCopy.type],
    [copy.stats.radius, `${formatNumber(locale, body.radiusKm, 0)} km`],
    [copy.stats.mass, `${formatNumber(locale, body.massCoeff, 3)} × 10${superscript(body.massExp)} kg`],
    [copy.stats.gravity, `${formatNumber(locale, body.gravity, 2)} m/s²`],
    [copy.stats.rotation, formatDays(locale, Math.abs(body.rotationDays))],
    [copy.stats.obliquity, `${formatNumber(locale, body.obliquity, 2)}°`],
    [copy.stats.temperature, bodyCopy.temp],
  ]

  if (body.orbit) {
    const distance = heliosDistanceAu(body.orbit, runtime.days)
    rows.splice(
      1,
      0,
      [copy.stats.currentDistance, `${formatNumber(locale, distance, 3)} ${copy.stats.au} · ${formatNumber(locale, distance * HELIOS_AU_KM / 1e6, 1)} ${copy.stats.millionKm}`],
      [copy.stats.semiMajor, `${formatNumber(locale, body.orbit.a, 3)} ${copy.stats.au}`],
      [copy.stats.orbitalPeriod, formatDays(locale, body.orbit.periodDays)],
      [copy.stats.eccentricity, formatNumber(locale, body.orbit.e, 4)],
      [copy.stats.inclination, `${formatNumber(locale, body.orbit.i, 3)}°`],
    )
  }

  if (id !== 'sun' && id !== 'moon') {
    rows.push([copy.stats.moons, String(body.moons)])
  }

  return <aside className="pointer-events-auto absolute bottom-[7.3rem] left-3 right-3 z-30 max-h-[42vh] overflow-auto rounded-2xl border border-white/10 bg-[#070a12]/90 p-4 shadow-2xl backdrop-blur-2xl md:bottom-auto md:left-auto md:right-5 md:top-28 md:w-[22rem] md:max-h-[calc(100%-9rem)]">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[.16em] text-zinc-500">{bodyCopy.latin}</p>
        <div className="mt-1 flex items-center gap-2">
          <h2 className="text-2xl font-black tracking-tight text-white">{bodyCopy.name}</h2>
          <span className="size-2.5 rounded-full shadow-[0_0_14px_currentColor]" style={{ background: body.color, color: body.color }}/>
        </div>
      </div>
      <button type="button" onClick={onClose} aria-label={copy.controls.closePanel} className="grid size-9 place-items-center rounded-xl border border-white/10 bg-white/[.04] text-zinc-400 hover:text-white">
        <X className="size-4"/>
      </button>
    </div>

    <p className="mt-3 text-sm leading-6 text-zinc-300">{bodyCopy.blurb}</p>

    <div className="mt-4 rounded-xl border border-white/[.08] bg-white/[.035] p-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[.12em] text-zinc-500">{copy.controls.approach}</p>
        <span className="text-[9px] font-bold uppercase tracking-[.1em] text-cyan-300/80">{copy.controls.cameraFlight}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {([
          ['orbit', copy.controls.approachOrbit],
          ['close', copy.controls.approachClose],
          ['inspect', copy.controls.approachInspect],
        ] as const).map(([level, label]) => <button
          key={level}
          type="button"
          aria-pressed={approachLevel === level}
          onClick={() => onApproachChange(level)}
          className={approachLevel === level
            ? 'rounded-lg bg-white px-2 py-2 text-[9px] font-black text-black'
            : 'rounded-lg border border-white/[.08] px-2 py-2 text-[9px] font-bold text-zinc-400 hover:text-white'}
        >
          {label}
        </button>)}
      </div>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          disabled={approachLevel === 'orbit'}
          onClick={() => onApproachChange(approachLevel === 'inspect' ? 'close' : 'orbit')}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/[.08] px-2 py-2 text-[10px] font-bold text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ZoomOut className="size-3.5"/>{copy.controls.approachFarther}
        </button>
        <button
          type="button"
          disabled={approachLevel === 'inspect'}
          onClick={() => onApproachChange(approachLevel === 'orbit' ? 'close' : 'inspect')}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-cyan-300/15 bg-cyan-400/[.06] px-2 py-2 text-[10px] font-bold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ZoomIn className="size-3.5"/>{copy.controls.approachCloser}
        </button>
      </div>
      {approachLevel === 'inspect' ? <p className="mt-2 text-[10px] leading-4 text-zinc-500">{copy.controls.closeViewNote}</p> : null}
    </div>

    <dl className="mt-4 space-y-2">
      {rows.map(([key, value]) => <div key={key} className="flex items-baseline justify-between gap-4 border-t border-white/[.07] pt-2">
        <dt className="text-[11px] text-zinc-500">{key}</dt>
        <dd className="max-w-[62%] text-right text-xs font-semibold tabular-nums text-zinc-200">{value}</dd>
      </div>)}
    </dl>
  </aside>
}

function Hud({
  locale,
  paused,
  speed,
  travelSpeed,
  cameraMode,
  approachLevel,
  selectedId,
  showLabels,
  showOrbits,
  showTrails,
  galacticMotion,
  setPaused,
  setSpeed,
  setTravelSpeed,
  setShowLabels,
  setShowOrbits,
  setShowTrails,
  setGalacticMotion,
  onSelectBody,
  onApproachChange,
  onSystemView,
  onSunView,
  onFreeView,
}: {
  locale: NexoraHeliosLocale
  paused: boolean
  speed: number
  travelSpeed: number
  cameraMode: HeliosCameraMode
  approachLevel: HeliosApproachLevel
  selectedId: HeliosBodyId | null
  showLabels: boolean
  showOrbits: boolean
  showTrails: boolean
  galacticMotion: boolean
  setPaused: (value: boolean) => void
  setSpeed: (value: number) => void
  setTravelSpeed: (value: number) => void
  setShowLabels: (value: boolean) => void
  setShowOrbits: (value: boolean) => void
  setShowTrails: (value: boolean) => void
  setGalacticMotion: (value: boolean) => void
  onSelectBody: (id: HeliosBodyId) => void
  onApproachChange: (level: HeliosApproachLevel) => void
  onSystemView: () => void
  onSunView: () => void
  onFreeView: () => void
}) {
  const copy = nexoraHeliosCopy[locale]
  const [days, setDays] = useState(runtime.days)

  useEffect(() => {
    const timer = window.setInterval(() => setDays(runtime.days), 140)
    return () => window.clearInterval(timer)
  }, [])

  const date = heliosDateFromDays(days)
  const formattedDate = new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)

  const presets = [
    [copy.controls.dayPerSecond, 1],
    [copy.controls.weekPerSecond, 7],
    [copy.controls.monthPerSecond, 30],
    [copy.controls.yearPerSecond, 365],
    [copy.controls.decadePerSecond, 3652],
  ] as const

  const travelPresets = [
    [copy.controls.travelSlow, 0.5],
    [copy.controls.travelNormal, 1],
    [copy.controls.travelFast, 2.5],
  ] as const

  return <div className="pointer-events-none absolute inset-0 z-20">
    <header className="pointer-events-auto absolute left-3 right-3 top-3 flex flex-col gap-2 md:left-5 md:right-5 md:top-5 md:flex-row md:items-start md:justify-between">
      <div className="flex max-w-[21rem] items-start gap-2">
        <div className="rounded-2xl border border-orange-300/15 bg-black/50 px-4 py-3 shadow-[0_0_32px_rgba(255,154,55,.08)] backdrop-blur-xl">
          <p className="text-xl font-black tracking-[-.03em] text-white md:text-2xl">{copy.title}</p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[.15em] text-orange-200/70">{copy.subtitle}</p>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-[.12em] text-cyan-200/60">{copy.controls.motionFrame}</p>
        </div>
        <div className="hidden gap-1.5 xl:flex">
          <Toggle pressed={showOrbits} label={copy.controls.orbits} onClick={() => setShowOrbits(!showOrbits)}>
            <Spline className="size-4"/>
          </Toggle>
          <Toggle pressed={showTrails} label={copy.controls.worldTrails} onClick={() => setShowTrails(!showTrails)}>
            <SparklesIcon className="size-4"/>
          </Toggle>
          <Toggle pressed={showLabels} label={copy.controls.labels} onClick={() => setShowLabels(!showLabels)}>
            {showLabels ? <Eye className="size-4"/> : <EyeOff className="size-4"/>}
          </Toggle>
          <Toggle pressed={galacticMotion} label={copy.controls.galacticMotion} onClick={() => setGalacticMotion(!galacticMotion)}>
            <Orbit className="size-4"/>
          </Toggle>
          <Toggle pressed={cameraMode === 'system'} label={copy.controls.cameraSystem} onClick={onSystemView}>
            <Crosshair className="size-4"/>
          </Toggle>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/55 p-3 backdrop-blur-xl md:w-[20rem]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={paused ? copy.controls.resume : copy.controls.pause}
            onClick={() => setPaused(!paused)}
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-black transition active:scale-95"
          >
            {paused ? <Play className="size-4"/> : <Pause className="size-4"/>}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[.12em] text-zinc-500">{copy.controls.simulationDate}</p>
            <p className="truncate text-sm font-bold text-white">{formattedDate}</p>
          </div>
          <button
            type="button"
            aria-label={copy.controls.reset}
            onClick={() => {
              runtime.days = heliosDaysSinceJ2000()
              runtime.travelSeconds = 0
              setDays(runtime.days)
            }}
            className="grid size-9 place-items-center rounded-xl border border-white/10 text-zinc-400 hover:text-white"
          >
            <RotateCcw className="size-4"/>
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <button
            type="button"
            aria-pressed={cameraMode === 'system'}
            onClick={onSystemView}
            className={cameraMode === 'system'
              ? 'flex items-center justify-center gap-1 rounded-lg bg-white px-2 py-2 text-[9px] font-black text-black'
              : 'flex items-center justify-center gap-1 rounded-lg border border-white/[.08] px-2 py-2 text-[9px] font-bold text-zinc-400 hover:text-white'}
          >
            <Move3D className="size-3.5"/>{copy.controls.cameraSystem}
          </button>
          <button
            type="button"
            aria-pressed={cameraMode === 'sun'}
            onClick={onSunView}
            className={cameraMode === 'sun'
              ? 'flex items-center justify-center gap-1 rounded-lg bg-orange-100 px-2 py-2 text-[9px] font-black text-black'
              : 'flex items-center justify-center gap-1 rounded-lg border border-white/[.08] px-2 py-2 text-[9px] font-bold text-zinc-400 hover:text-white'}
          >
            <SunMedium className="size-3.5"/>{copy.controls.cameraSun}
          </button>
          <button
            type="button"
            aria-pressed={cameraMode === 'free'}
            onClick={onFreeView}
            className={cameraMode === 'free'
              ? 'flex items-center justify-center gap-1 rounded-lg bg-cyan-100 px-2 py-2 text-[9px] font-black text-black'
              : 'flex items-center justify-center gap-1 rounded-lg border border-white/[.08] px-2 py-2 text-[9px] font-bold text-zinc-400 hover:text-white'}
          >
            <MousePointer2 className="size-3.5"/>{copy.controls.cameraFree}
          </button>
        </div>

        <label className="mt-3 block">
          <span className="flex justify-between gap-3 text-[10px] font-bold uppercase tracking-[.1em] text-zinc-500">
            <span>{copy.controls.speed}</span>
            <span className="font-mono text-cyan-300">{formatNumber(locale, speed, speed < 10 ? 1 : 0)} d/s</span>
          </span>
          <input
            aria-label={copy.controls.speed}
            type="range"
            min={0}
            max={100}
            step={0.4}
            value={speedToSlider(speed)}
            onChange={(event) => setSpeed(sliderToSpeed(Number(event.target.value)))}
            className="mt-2 w-full accent-cyan-400"
          />
        </label>

        <div className="mt-1.5 flex flex-wrap gap-1">
          {presets.map(([label, value]) => <button
            key={value}
            type="button"
            onClick={() => setSpeed(value)}
            className={Math.abs(speed - value) / value < 0.08
              ? 'rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-black'
              : 'rounded-full border border-white/[.07] px-2.5 py-1 text-[10px] font-bold text-zinc-500 hover:text-white'}
          >
            {label}
          </button>)}
        </div>

        <label className="mt-3 block">
          <span className="flex justify-between gap-3 text-[10px] font-bold uppercase tracking-[.1em] text-zinc-500">
            <span>{copy.controls.travelSpeed}</span>
            <span className="font-mono text-orange-300">{formatNumber(locale, travelSpeed, 2)}×</span>
          </span>
          <input
            aria-label={copy.controls.travelSpeed}
            type="range"
            min={TRAVEL_SPEED_MIN}
            max={TRAVEL_SPEED_MAX}
            step={0.05}
            value={travelSpeed}
            onChange={(event) => setTravelSpeed(Number(event.target.value))}
            className="mt-2 w-full accent-orange-400"
          />
        </label>

        <div className="mt-1.5 flex gap-1">
          {travelPresets.map(([label, value]) => <button
            key={value}
            type="button"
            onClick={() => setTravelSpeed(value)}
            className={Math.abs(travelSpeed - value) < 0.06
              ? 'flex-1 rounded-full bg-orange-100 px-2 py-1 text-[9px] font-black text-black'
              : 'flex-1 rounded-full border border-white/[.07] px-2 py-1 text-[9px] font-bold text-zinc-500 hover:text-white'}
          >
            {label}
          </button>)}
        </div>
      </div>
    </header>

    <div className="pointer-events-auto absolute bottom-[4.1rem] left-3 flex gap-1.5 xl:hidden">
      <Toggle pressed={showOrbits} label={copy.controls.orbits} onClick={() => setShowOrbits(!showOrbits)}>
        <Spline className="size-4"/>
      </Toggle>
      <Toggle pressed={showTrails} label={copy.controls.worldTrails} onClick={() => setShowTrails(!showTrails)}>
        <SparklesIcon className="size-4"/>
      </Toggle>
      <Toggle pressed={showLabels} label={copy.controls.labels} onClick={() => setShowLabels(!showLabels)}>
        {showLabels ? <Eye className="size-4"/> : <EyeOff className="size-4"/>}
      </Toggle>
      <Toggle pressed={galacticMotion} label={copy.controls.galacticMotion} onClick={() => setGalacticMotion(!galacticMotion)}>
        <Orbit className="size-4"/>
      </Toggle>
      <Toggle pressed={cameraMode === 'system'} label={copy.controls.cameraSystem} onClick={onSystemView}>
        <Crosshair className="size-4"/>
      </Toggle>
    </div>

    <nav className="pointer-events-auto absolute bottom-2 left-0 right-0 px-3 md:bottom-4 md:px-5">
      <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_IDS.map((id) => {
          const body = HELIOS_BODY_BY_ID[id]
          const active = selectedId === id
          return <button
            key={id}
            type="button"
            onClick={() => active ? onSystemView() : onSelectBody(id)}
            className={active
              ? 'flex h-10 shrink-0 items-center gap-2 rounded-full bg-white px-3.5 text-xs font-black text-black shadow-lg'
              : 'flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3.5 text-xs font-bold text-zinc-300 backdrop-blur-xl hover:bg-white/10'}
          >
            <span className="size-2 rounded-full shadow-[0_0_12px_currentColor]" style={{ background: body.color, color: body.color }}/>
            {copy.bodies[id].name}
          </button>
        })}
      </div>
      <p className="mx-auto mt-2 hidden max-w-6xl text-center text-[10px] font-medium tracking-wide text-zinc-500 md:block">{copy.controls.instructions}</p>
    </nav>

    {selectedId ? <BodyInfo
      locale={locale}
      id={selectedId}
      approachLevel={approachLevel}
      onApproachChange={onApproachChange}
      onClose={onSystemView}
    /> : null}
  </div>
}

export function NexoraHeliosExperience({ locale }: { locale: NexoraHeliosLocale }) {
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(SPEED_DEFAULT)
  const [travelSpeed, setTravelSpeed] = useState(TRAVEL_SPEED_DEFAULT)
  const [cameraMode, setCameraMode] = useState<HeliosCameraMode>('system')
  const [approachLevel, setApproachLevel] = useState<HeliosApproachLevel>('orbit')
  const [selectedId, setSelectedId] = useState<HeliosBodyId | null>(null)
  const [hoveredId, setHoveredId] = useState<HeliosBodyId | null>(null)
  const [showLabels, setShowLabels] = useState(true)
  const [showOrbits, setShowOrbits] = useState(true)
  const [showTrails, setShowTrails] = useState(true)
  const [galacticMotion, setGalacticMotion] = useState(true)

  const selectBody = (id: HeliosBodyId) => {
    setSelectedId(id)
    setApproachLevel('orbit')
    setCameraMode(id === 'sun' ? 'sun' : 'body')
  }

  const changeApproach = (level: HeliosApproachLevel) => {
    if (!selectedId) return
    setApproachLevel(level)
    setCameraMode(selectedId === 'sun' ? 'sun' : 'body')
  }

  const showSystem = () => {
    setSelectedId(null)
    setApproachLevel('orbit')
    setCameraMode('system')
  }

  const showSun = () => {
    setSelectedId('sun')
    setApproachLevel('orbit')
    setCameraMode('sun')
  }

  const showFree = () => {
    setSelectedId(null)
    setApproachLevel('orbit')
    setCameraMode('free')
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
      if (event.code === 'Space') {
        event.preventDefault()
        setPaused((value) => !value)
      } else if (event.code === 'Escape') {
        setSelectedId(null)
        setCameraMode('system')
      } else if (event.key === '0') {
        setSelectedId('sun')
        setCameraMode('sun')
      } else if (event.key >= '1' && event.key <= '8') {
        setSelectedId(HELIOS_PLANETS[Number(event.key) - 1]?.id ?? null)
        setCameraMode('body')
      } else if (event.key === ']' && selectedId) {
        setApproachLevel((value) => value === 'orbit' ? 'close' : 'inspect')
      } else if (event.key === '[' && selectedId) {
        setApproachLevel((value) => value === 'inspect' ? 'close' : 'orbit')
      } else if (event.key === '+' || event.key === '=') {
        setSpeed((value) => Math.min(SPEED_MAX, value * 1.6))
      } else if (event.key === '-' || event.key === '_') {
        setSpeed((value) => Math.max(SPEED_MIN, value / 1.6))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId])

  return <div className="relative h-[calc(100dvh-4rem)] min-h-[620px] w-full overflow-hidden bg-[#02040a] lg:h-dvh">
    <SolarCanvas
      paused={paused}
      speed={speed}
      travelSpeed={travelSpeed}
      cameraMode={cameraMode}
      approachLevel={approachLevel}
      selectedId={selectedId}
      showOrbits={showOrbits}
      showTrails={showTrails}
      galacticMotion={galacticMotion}
      onSelect={selectBody}
      onHover={setHoveredId}
    />
    <PlanetLabels locale={locale} visible={showLabels} selectedId={selectedId} hoveredId={hoveredId}/>
    <Hud
      locale={locale}
      paused={paused}
      speed={speed}
      travelSpeed={travelSpeed}
      cameraMode={cameraMode}
      approachLevel={approachLevel}
      selectedId={selectedId}
      showLabels={showLabels}
      showOrbits={showOrbits}
      showTrails={showTrails}
      galacticMotion={galacticMotion}
      setPaused={setPaused}
      setSpeed={setSpeed}
      setTravelSpeed={setTravelSpeed}
      setShowLabels={setShowLabels}
      setShowOrbits={setShowOrbits}
      setShowTrails={setShowTrails}
      setGalacticMotion={setGalacticMotion}
      onSelectBody={selectBody}
      onApproachChange={changeApproach}
      onSystemView={showSystem}
      onSunView={showSun}
      onFreeView={showFree}
    />
  </div>
}
