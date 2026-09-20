import { BODY_BY_ID, MOON, PLANETS, type BodyId } from "./bodies";
import { positionScene } from "./kepler";
import { runtime } from "./runtime";

export function stepPositions(): void {
  const days = runtime.days;
  const center = runtime.systemCenter;
  runtime.positions.sun = { ...center };
  for (const p of PLANETS) {
    if (!p.orbit) continue;
    const [x, y, z] = positionScene(p.orbit, days);
    runtime.positions[p.id] = { x: x + center.x, y: y + center.y, z: z + center.z };
  }
  const earth = runtime.positions.earth;
  if (earth && MOON.orbit) {
    const n = (Math.PI * 2) / MOON.orbit.periodDays;
    const ang = n * days;
    const dist = BODY_BY_ID.earth.visualRadius * 2.65;
    const inc = (MOON.orbit.i * Math.PI) / 180;
    const mx = Math.cos(ang) * dist;
    const my = Math.sin(ang) * dist * Math.sin(inc);
    const mz = Math.sin(ang) * dist;
    runtime.positions.moon = { x: earth.x + mx, y: earth.y + my, z: earth.z + mz };
  }
}

export function getPos(id: BodyId): { x: number; y: number; z: number } {
  return runtime.positions[id] ?? { x: 0, y: 0, z: 0 };
}
