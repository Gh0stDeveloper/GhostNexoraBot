import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { GALILEAN, MOON, PLANETS, SUN, type BodyDef, type BodyId } from "../../lib/solar-system/bodies";
import { orbitCurve, positionScene, trailCurve } from "../../lib/solar-system/kepler";
import { runtime } from "../../lib/solar-system/runtime";
import { useSolar } from "../../lib/solar-system/store";
import { makeCloudTexture, makePlanetTexture, makeRingTexture, makeSunGlowTexture } from "../../lib/solar-system/textures";
import { Atmosphere } from "./atmosphere";

const _moonOff = new THREE.Vector3();
const _worldPos = new THREE.Vector3();

function useDeferredTexture(factory: () => THREE.Texture | null): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let created: THREE.Texture | null = null;
    const id = window.setTimeout(() => {
      created = factory();
      if (created) setTex(created);
    }, 0);
    return () => {
      window.clearTimeout(id);
      created?.dispose();
    };
  }, [factory]);
  return tex;
}

function spinStep(body: BodyDef, simDaysDelta: number): number {
  if (body.rotationDays === 0) return 0;
  return (simDaysDelta / body.rotationDays) * Math.PI * 2;
}

export function Sun() {
  const spin = useRef<THREE.Mesh>(null);
  const factory = useMemo(() => () => makePlanetTexture("sun"), []);
  const map = useDeferredTexture(factory);
  const glowFactory = useMemo(() => () => makeSunGlowTexture(), []);
  const glow = useDeferredTexture(glowFactory);
  const selected = useSolar((s) => s.selectedId === "sun");

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.1);
    if (spin.current) {
      spin.current.getWorldPosition(_worldPos);
      runtime.positions.sun = { x: _worldPos.x, y: _worldPos.y, z: _worldPos.z };
    }
    const { paused, speed } = useSolar.getState();
    if (!paused && spin.current) {
      spin.current.rotation.y += spinStep(SUN, speed * d);
    }
  });

  return (
    <group>
      <mesh
        ref={spin}
        onClick={(e) => {
          e.stopPropagation();
          useSolar.getState().select("sun");
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          useSolar.getState().setHovered("sun");
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          useSolar.getState().setHovered(null);
          document.body.style.cursor = "";
        }}
      >
        <sphereGeometry args={[SUN.visualRadius, 80, 80]} />
        <meshBasicMaterial map={map} color={map ? "#fff4d2" : "#ffb534"} toneMapped={false} />
      </mesh>
      <mesh scale={1.09}>
        <sphereGeometry args={[SUN.visualRadius, 48, 48]} />
        <meshBasicMaterial color="#ff9d24" transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh scale={1.25}>
        <sphereGeometry args={[SUN.visualRadius, 36, 36]} />
        <meshBasicMaterial color="#ff6a12" transparent opacity={0.07} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      {glow ? (
        <sprite scale={[SUN.visualRadius * 8.6, SUN.visualRadius * 8.6, 1]}>
          <spriteMaterial map={glow} color="#ffb13b" transparent opacity={0.62} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      ) : null}
      <pointLight color="#fff0c2" intensity={155} distance={620} decay={1.78} />
      {selected ? <FocusRing radius={SUN.visualRadius * 1.22} color="#ecece8" /> : null}
    </group>
  );
}

function FocusRing({ radius, color }: { radius: number; color: string }) {
  const pts = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      out.push([Math.cos(a) * radius, 0, Math.sin(a) * radius]);
    }
    return out;
  }, [radius]);
  return <Line points={pts} color={color} lineWidth={1.1} transparent opacity={0.55} />;
}

function HitSphere({ radius, id }: { radius: number; id: BodyId }) {
  return (
    <mesh
      visible={false}
      onClick={(e) => {
        e.stopPropagation();
        useSolar.getState().select(id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        useSolar.getState().setHovered(id);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        useSolar.getState().setHovered(null);
        document.body.style.cursor = "";
      }}
    >
      <sphereGeometry args={[Math.max(radius * 1.9, 1.55), 16, 16]} />
    </mesh>
  );
}

export function Planet({ body }: { body: BodyDef }) {
  const group = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const mapFactory = useMemo(() => () => makePlanetTexture(body.id), [body.id]);
  const cloudFactory = useMemo(
    () => () => (body.id === "earth" ? makeCloudTexture() : null),
    [body.id],
  );
  const ringFactory = useMemo(
    () => () => (body.rings ? makeRingTexture() : null),
    [body.id, body.rings],
  );
  const map = useDeferredTexture(mapFactory);
  const cloudMap = useDeferredTexture(cloudFactory);
  const ringMap = useDeferredTexture(ringFactory);
  const selected = useSolar((s) => s.selectedId === body.id);
  const tilt = (body.obliquity * Math.PI) / 180;

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.1);
    if (!body.orbit || !group.current) return;
    const [x, y, z] = positionScene(body.orbit, runtime.days);
    group.current.position.set(x, y, z);
    group.current.getWorldPosition(_worldPos);
    runtime.positions[body.id] = { x: _worldPos.x, y: _worldPos.y, z: _worldPos.z };
    const { paused, speed } = useSolar.getState();
    if (!paused && spin.current) {
      spin.current.rotation.y += spinStep(body, speed * d);
    }
  });

  return (
    <group ref={group}>
      <group rotation={[0, 0, tilt]}>
        <group ref={spin}>
          <mesh>
            <sphereGeometry args={[body.visualRadius, 64, 64]} />
            <meshStandardMaterial
              map={map}
              color={map ? "#ffffff" : body.color}
              roughness={body.roughness}
              metalness={body.metalness}
            />
          </mesh>
          {body.id === "earth" && cloudMap ? (
            <mesh>
              <sphereGeometry args={[body.visualRadius * 1.018, 48, 48]} />
              <meshStandardMaterial map={cloudMap} transparent depthWrite={false} roughness={1} metalness={0} />
            </mesh>
          ) : null}
        </group>
        {body.atmosphere ? <Atmosphere radius={body.visualRadius} color={body.atmosphere} /> : null}
        {body.rings && ringMap ? (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry
              args={[body.visualRadius * body.rings.inner, body.visualRadius * body.rings.outer, 96]}
            />
            <meshStandardMaterial
              map={ringMap}
              side={THREE.DoubleSide}
              transparent
              depthWrite={false}
              roughness={0.55}
              metalness={0.12}
            />
          </mesh>
        ) : null}
      </group>
      <HitSphere radius={body.visualRadius} id={body.id} />
      {selected ? <FocusRing radius={body.visualRadius * 1.55} color={body.color} /> : null}
      {body.id === "earth" ? <Luna /> : null}
      {body.id === "jupiter" ? <GalileanMoons /> : null}
    </group>
  );
}

function Luna() {
  const ref = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Mesh>(null);
  const factory = useMemo(() => () => makePlanetTexture("moon"), []);
  const map = useDeferredTexture(factory);
  const selected = useSolar((s) => s.selectedId === "moon");

  useFrame((_, delta) => {
    if (!ref.current || !MOON.orbit) return;
    const d = Math.min(delta, 0.1);
    const n = (Math.PI * 2) / MOON.orbit.periodDays;
    const ang = n * runtime.days;
    const dist = 0.82 * 2.65;
    const inc = (MOON.orbit.i * Math.PI) / 180;
    _moonOff.set(Math.cos(ang) * dist, Math.sin(ang) * dist * Math.sin(inc), Math.sin(ang) * dist);
    ref.current.position.copy(_moonOff);
    ref.current.getWorldPosition(_worldPos);
    runtime.positions.moon = { x: _worldPos.x, y: _worldPos.y, z: _worldPos.z };
    const { paused, speed } = useSolar.getState();
    if (!paused && spin.current) {
      spin.current.rotation.y += spinStep(MOON, speed * d);
    }
  });

  return (
    <group ref={ref}>
      <mesh
        ref={spin}
        onClick={(e) => {
          e.stopPropagation();
          useSolar.getState().select("moon");
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          useSolar.getState().setHovered("moon");
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          useSolar.getState().setHovered(null);
          document.body.style.cursor = "";
        }}
      >
        <sphereGeometry args={[MOON.visualRadius, 32, 32]} />
        <meshStandardMaterial
          map={map}
          color={map ? "#ffffff" : MOON.color}
          roughness={0.95}
          metalness={0.08}
        />
      </mesh>
      {selected ? <FocusRing radius={MOON.visualRadius * 1.8} color={MOON.color} /> : null}
    </group>
  );
}

function GalileanMoons() {
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const days = runtime.days;
    GALILEAN.forEach((m, i) => {
      const g = refs.current[i];
      if (!g) return;
      const ang = ((Math.PI * 2) / m.periodDays) * days + i * 0.4;
      g.position.set(Math.cos(ang) * m.distance, Math.sin(ang) * 0.04, Math.sin(ang) * m.distance);
    });
  });
  return (
    <group>
      {GALILEAN.map((m, i) => (
        <group
          key={m.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <mesh>
            <sphereGeometry args={[m.radius, 12, 12]} />
            <meshStandardMaterial color={m.color} roughness={0.7} metalness={0.08} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function OrbitPaths() {
  const show = useSolar((s) => s.showOrbits);
  const curves = useMemo(
    () =>
      PLANETS.filter((p) => p.orbit).map((p) => ({
        id: p.id,
        color: p.color,
        pts: orbitCurve(p.orbit!),
      })),
    [],
  );
  if (!show) return null;
  return (
    <group>
      {curves.map((c) => (
        <Line key={c.id} points={c.pts} color={c.color} lineWidth={1} transparent opacity={0.28} />
      ))}
    </group>
  );
}

export function Trails() {
  const show = useSolar((s) => s.showTrails);
  if (!show) return null;
  return (
    <group>
      {PLANETS.filter((p) => p.orbit).map((p) => (
        <TrailLine key={p.id} body={p} />
      ))}
    </group>
  );
}

function TrailLine({ body }: { body: BodyDef }) {
  const obj = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
    const material = new THREE.LineBasicMaterial({
      color: body.color,
      transparent: true,
      opacity: 0.62,
    });
    return new THREE.Line(geometry, material);
  }, [body.color]);

  useEffect(() => {
    return () => {
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    };
  }, [obj]);

  useFrame(() => {
    if (!body.orbit) return;
    const pts = trailCurve(body.orbit, runtime.days, 0.16, 48);
    const pos = obj.geometry.getAttribute("position");
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      pos.setXYZ(i, p[0], p[1], p[2]);
    }
    pos.needsUpdate = true;
  });

  return <primitive object={obj} />;
}

export function AsteroidBelt() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const COUNT = 560;
  const asteroids = useMemo(() => {
    let a = 2024;
    const rand = () => {
      a = (a * 1664525 + 1013904223) >>> 0;
      return a / 4294967296;
    };
    return Array.from({ length: COUNT }, () => ({
      a: 2.1 + rand() * 1.4,
      e: 0.02 + rand() * 0.14,
      i: (rand() - 0.5) * 16,
      Omega: rand() * 360,
      w: rand() * 360,
      M0: rand() * 360,
      periodDays: 1200 + rand() * 1400,
      scale: 0.03 + rand() * 0.07,
      tilt: rand() * Math.PI,
    }));
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const inst = mesh.current;
    if (!inst) return;
    const days = runtime.days;
    for (let i = 0; i < COUNT; i++) {
      const ast = asteroids[i]!;
      const [x, y, z] = positionScene(ast, days);
      dummy.position.set(x, y, z);
      dummy.rotation.set(ast.tilt, ast.Omega, ast.i);
      dummy.scale.setScalar(ast.scale);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#8a8178" roughness={0.92} metalness={0.08} />
    </instancedMesh>
  );
}
