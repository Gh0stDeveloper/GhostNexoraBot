/** Keplerian two-body propagation in the J2000 ecliptic, mapped to three.js Y-up. */

export const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

/** Scene units for 1 AU after the distance-compression curve. */
export const AU_SCALE = 24;
export const DIST_EXP = 0.52;

export type OrbitalElements = {
  a: number;
  e: number;
  i: number;
  Omega: number;
  w: number;
  M0: number;
  periodDays: number;
};

export function daysSinceJ2000(ms: number = Date.now()): number {
  return (ms - J2000_MS) / 86_400_000;
}

export function dateFromSimDays(days: number): Date {
  return new Date(J2000_MS + days * 86_400_000);
}

export function visualSemiMajor(aAu: number): number {
  return AU_SCALE * Math.pow(Math.max(aAu, 1e-6), DIST_EXP);
}

function mod2pi(a: number): number {
  const t = a % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
}

/** Newton–Raphson solver for Kepler's equation M = E − e sin E. */
export function solveKepler(M: number, e: number): number {
  const m = mod2pi(M);
  let E = e < 0.8 ? m : Math.PI;
  for (let n = 0; n < 14; n++) {
    const dE = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

export function trueAnomaly(E: number, e: number): number {
  const beta = Math.sqrt((1 + e) / Math.max(1 - e, 1e-12));
  return 2 * Math.atan2(beta * Math.sin(E / 2), Math.cos(E / 2));
}

/** Rotate a polar orbital-plane point into the J2000 ecliptic (X,Y,Z). */
export function eclipticFromTrueAnomaly(
  r: number,
  nu: number,
  OmegaDeg: number,
  iDeg: number,
  wDeg: number,
): { x: number; y: number; z: number } {
  const O = (OmegaDeg * Math.PI) / 180;
  const inc = (iDeg * Math.PI) / 180;
  const arg = (wDeg * Math.PI) / 180 + nu;
  const x = r * (Math.cos(O) * Math.cos(arg) - Math.sin(O) * Math.sin(arg) * Math.cos(inc));
  const y = r * (Math.sin(O) * Math.cos(arg) + Math.cos(O) * Math.sin(arg) * Math.cos(inc));
  const z = r * (Math.sin(arg) * Math.sin(inc));
  return { x, y, z };
}

/** Astronomy ecliptic → three.js (Y up, XZ = ecliptic). */
export function toScene(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y];
}

export function meanAnomaly(elements: OrbitalElements, days: number): number {
  const n = (Math.PI * 2) / elements.periodDays;
  return (elements.M0 * Math.PI) / 180 + n * days;
}

/**
 * Scene-space position. Semi-major axis is compressed so the whole system
 * fits a single view; eccentricity, inclination and angles stay real, so
 * ellipses keep their true shape.
 */
export function positionScene(elements: OrbitalElements, days: number): [number, number, number] {
  const E = solveKepler(meanAnomaly(elements, days), elements.e);
  const nu = trueAnomaly(E, elements.e);
  const aVis = visualSemiMajor(elements.a);
  const r = aVis * (1 - elements.e * Math.cos(E));
  const p = eclipticFromTrueAnomaly(r, nu, elements.Omega, elements.i, elements.w);
  return toScene(p.x, p.y, p.z);
}

/** Heliocentric distance in AU at `days` after J2000. */
export function distanceAu(elements: OrbitalElements, days: number): number {
  const E = solveKepler(meanAnomaly(elements, days), elements.e);
  return elements.a * (1 - elements.e * Math.cos(E));
}

export function orbitCurve(elements: OrbitalElements, samples = 192): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const aVis = visualSemiMajor(elements.a);
  for (let i = 0; i <= samples; i++) {
    const nu = (i / samples) * Math.PI * 2;
    const r = (aVis * (1 - elements.e * elements.e)) / (1 + elements.e * Math.cos(nu));
    const p = eclipticFromTrueAnomaly(r, nu, elements.Omega, elements.i, elements.w);
    pts.push(toScene(p.x, p.y, p.z));
  }
  return pts;
}

export function trailCurve(
  elements: OrbitalElements,
  days: number,
  fraction = 0.16,
  samples = 48,
): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const span = elements.periodDays * fraction;
  for (let i = 0; i < samples; i++) {
    const t = days - (i / (samples - 1)) * span;
    pts.push(positionScene(elements, t));
  }
  return pts;
}
