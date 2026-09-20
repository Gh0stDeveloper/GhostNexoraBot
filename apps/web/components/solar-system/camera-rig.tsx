import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { BODY_BY_ID } from "../../lib/solar-system/bodies";
import { runtime } from "../../lib/solar-system/runtime";
import { useSolar } from "../../lib/solar-system/store";

const OVERVIEW = new THREE.Vector3(36, 58, 188);
const _target = new THREE.Vector3();
const _goalCam = new THREE.Vector3();
const _shift = new THREE.Vector3();
const _dir = new THREE.Vector3();

function bodyFocusDistance(id: string): number {
  if (id === "sun") return 15;
  const body = BODY_BY_ID[id as keyof typeof BODY_BY_ID];
  if (!body) return 12;
  if (body.id === "jupiter" || body.id === "saturn") return body.visualRadius * 6.6;
  return Math.max(body.visualRadius * 7.6, 5.8);
}

export function CameraRig() {
  const controls = useRef<any>(null);
  const selectedId = useSolar((s) => s.selectedId);
  const arriving = useRef(false);
  const prevSelection = useRef<string | null | undefined>(undefined);
  const previousTarget = useRef(new THREE.Vector3());
  const { camera } = useThree();

  useEffect(() => {
    if (prevSelection.current === selectedId) return;
    prevSelection.current = selectedId;
    arriving.current = true;
    const pos = selectedId ? runtime.positions[selectedId] : runtime.systemCenter;
    _target.set(pos?.x ?? 0, pos?.y ?? 0, pos?.z ?? 0);
    const distance = selectedId ? bodyFocusDistance(selectedId) : OVERVIEW.length();

    _dir.copy(camera.position).sub(controls.current?.target ?? _target);
    if (_dir.lengthSq() < 1e-6) _dir.set(0.55, 0.36, 0.76);
    _dir.normalize();
    _goalCam.copy(_target).addScaledVector(_dir, distance);
    if (!selectedId) _goalCam.copy(OVERVIEW).add(_target);
    previousTarget.current.copy(_target);
  }, [selectedId, camera]);

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;
    const d = Math.min(delta, 0.1);
    const selected = useSolar.getState().selectedId;
    const pos = selected ? runtime.positions[selected] : runtime.systemCenter;
    _target.set(pos?.x ?? 0, pos?.y ?? 0, pos?.z ?? 0);

    if (arriving.current) {
      if (selected) {
        _dir.copy(_goalCam).sub(c.target);
        const distance = Math.max(_dir.length(), 0.01);
        _dir.normalize();
        _goalCam.copy(_target).addScaledVector(_dir, distance);
      } else {
        _goalCam.copy(OVERVIEW).add(_target);
      }
      const k = 1 - Math.exp(-3.15 * d);
      c.target.lerp(_target, k);
      camera.position.lerp(_goalCam, k);
      if (c.target.distanceTo(_target) < 0.08 && camera.position.distanceTo(_goalCam) < 0.2) {
        arriving.current = false;
      }
    } else {
      _shift.copy(_target).sub(previousTarget.current);
      camera.position.add(_shift);
      c.target.add(_shift);
      c.target.lerp(_target, 0.22);
    }

    previousTarget.current.copy(_target);
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.07}
      minDistance={1.35}
      maxDistance={520}
      enablePan
      makeDefault
      zoomSpeed={0.85}
      rotateSpeed={0.72}
    />
  );
}
