export type HeliosBodyId =
  | 'sun'
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'moon'

export type HeliosOrbit = {
  a: number
  e: number
  i: number
  Omega: number
  w: number
  M0: number
  periodDays: number
}

export type HeliosBody = {
  id: HeliosBodyId
  orbit?: HeliosOrbit
  rotationDays: number
  obliquity: number
  radiusKm: number
  massCoeff: number
  massExp: number
  gravity: number
  moons: number
  visualRadius: number
  color: string
  atmosphere?: string
  roughness: number
  metalness: number
  rings?: { inner: number; outer: number; opacity: number }
}

export const HELIOS_J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0)
export const HELIOS_AU_KM = 149_597_870.7
export const HELIOS_AU_SCALE = 24
export const HELIOS_DISTANCE_EXPONENT = 0.52

export const HELIOS_SYSTEM_TRAVEL_DIRECTION = [0.72, 0.16, -0.675] as const
export const HELIOS_SYSTEM_TRAVEL_UNITS_PER_SECOND = 2.35

export function heliosSystemOffset(
  travelSeconds: number,
  travelMultiplier = 1,
): [number, number, number] {
  const distance = Math.max(0, travelSeconds) * HELIOS_SYSTEM_TRAVEL_UNITS_PER_SECOND * Math.max(0, travelMultiplier)
  return [
    HELIOS_SYSTEM_TRAVEL_DIRECTION[0] * distance,
    HELIOS_SYSTEM_TRAVEL_DIRECTION[1] * distance,
    HELIOS_SYSTEM_TRAVEL_DIRECTION[2] * distance,
  ]
}

export const HELIOS_SUN: HeliosBody = {
  id: 'sun',
  rotationDays: 25.38,
  obliquity: 7.25,
  radiusKm: 695700,
  massCoeff: 1.9885,
  massExp: 30,
  gravity: 274,
  moons: 0,
  visualRadius: 2.7,
  color: '#ffb13b',
  roughness: 0.35,
  metalness: 0,
}

export const HELIOS_PLANETS: HeliosBody[] = [
  {
    id: 'mercury',
    orbit: { a: 0.38709927, e: 0.20563593, i: 7.00497902, Omega: 48.33076593, w: 29.12703035, M0: 174.79252722, periodDays: 87.969 },
    rotationDays: 58.646,
    obliquity: 0.034,
    radiusKm: 2439.7,
    massCoeff: 3.301,
    massExp: 23,
    gravity: 3.7,
    moons: 0,
    visualRadius: 0.44,
    color: '#9e9388',
    roughness: 0.94,
    metalness: 0.08,
  },
  {
    id: 'venus',
    orbit: { a: 0.72333566, e: 0.00677672, i: 3.39467605, Omega: 76.67984255, w: 54.92262463, M0: 50.37663232, periodDays: 224.701 },
    rotationDays: -243.025,
    obliquity: 177.36,
    radiusKm: 6051.8,
    massCoeff: 4.867,
    massExp: 24,
    gravity: 8.87,
    moons: 0,
    visualRadius: 0.8,
    color: '#d9ad63',
    atmosphere: '#ffd89a',
    roughness: 0.5,
    metalness: 0.01,
  },
  {
    id: 'earth',
    orbit: { a: 1.00000261, e: 0.01671123, i: 0.00001531, Omega: 0, w: 102.93768193, M0: 357.52688973, periodDays: 365.256 },
    rotationDays: 0.997269,
    obliquity: 23.44,
    radiusKm: 6371,
    massCoeff: 5.972,
    massExp: 24,
    gravity: 9.8,
    moons: 1,
    visualRadius: 0.86,
    color: '#2f7fe8',
    atmosphere: '#69c7ff',
    roughness: 0.42,
    metalness: 0.02,
  },
  {
    id: 'mars',
    orbit: { a: 1.52371034, e: 0.0933941, i: 1.84969142, Omega: 49.55953891, w: 286.4968315, M0: 19.39019754, periodDays: 686.98 },
    rotationDays: 1.025957,
    obliquity: 25.19,
    radiusKm: 3389.5,
    massCoeff: 6.417,
    massExp: 23,
    gravity: 3.71,
    moons: 2,
    visualRadius: 0.55,
    color: '#d05b32',
    atmosphere: '#ff8b59',
    roughness: 0.88,
    metalness: 0.02,
  },
  {
    id: 'jupiter',
    orbit: { a: 5.202887, e: 0.04838624, i: 1.30439695, Omega: 100.47390909, w: 274.25457074, M0: 19.66796068, periodDays: 4332.589 },
    rotationDays: 0.41354,
    obliquity: 3.13,
    radiusKm: 69911,
    massCoeff: 1.898,
    massExp: 27,
    gravity: 24.79,
    moons: 115,
    visualRadius: 2.42,
    color: '#d6a579',
    atmosphere: '#f0c593',
    roughness: 0.38,
    metalness: 0,
  },
  {
    id: 'saturn',
    orbit: { a: 9.53667594, e: 0.05386179, i: 2.48599187, Omega: 113.66242448, w: 338.93645383, M0: 317.35536592, periodDays: 10759.22 },
    rotationDays: 0.44401,
    obliquity: 26.73,
    radiusKm: 58232,
    massCoeff: 5.683,
    massExp: 26,
    gravity: 10.44,
    moons: 293,
    visualRadius: 2.08,
    color: '#e7cd8c',
    atmosphere: '#f7dfad',
    roughness: 0.38,
    metalness: 0.01,
    rings: { inner: 1.28, outer: 2.42, opacity: 0.9 },
  },
  {
    id: 'uranus',
    orbit: { a: 19.18916464, e: 0.04725744, i: 0.77263783, Omega: 74.01692503, w: 96.93735127, M0: 142.28382821, periodDays: 30685.4 },
    rotationDays: -0.71833,
    obliquity: 97.77,
    radiusKm: 25362,
    massCoeff: 8.681,
    massExp: 25,
    gravity: 8.69,
    moons: 29,
    visualRadius: 1.28,
    color: '#86d7df',
    atmosphere: '#a9f0ef',
    roughness: 0.34,
    metalness: 0.02,
    rings: { inner: 1.45, outer: 1.82, opacity: 0.2 },
  },
  {
    id: 'neptune',
    orbit: { a: 30.06992276, e: 0.00859048, i: 1.77004347, Omega: 131.78422574, w: 273.18698507, M0: 259.9087595, periodDays: 60189 },
    rotationDays: 0.67125,
    obliquity: 28.32,
    radiusKm: 24622,
    massCoeff: 1.024,
    massExp: 26,
    gravity: 11.15,
    moons: 16,
    visualRadius: 1.24,
    color: '#2868dc',
    atmosphere: '#5c96ff',
    roughness: 0.33,
    metalness: 0.02,
  },
]

export const HELIOS_MOON: HeliosBody = {
  id: 'moon',
  orbit: { a: 0.00257, e: 0.0549, i: 5.145, Omega: 125.08, w: 318.15, M0: 135.27, periodDays: 27.321582 },
  rotationDays: 27.321582,
  obliquity: 6.68,
  radiusKm: 1737.4,
  massCoeff: 7.342,
  massExp: 22,
  gravity: 1.62,
  moons: 0,
  visualRadius: 0.23,
  color: '#bcb7ae',
  roughness: 0.96,
  metalness: 0.04,
}

export const HELIOS_GALILEAN = [
  { id: 'io', periodDays: 1.769, radius: 0.115, distance: 1.76, color: '#f0c34c' },
  { id: 'europa', periodDays: 3.551, radius: 0.102, distance: 2.22, color: '#e5d6bb' },
  { id: 'ganymede', periodDays: 7.155, radius: 0.155, distance: 2.9, color: '#ad9578' },
  { id: 'callisto', periodDays: 16.689, radius: 0.132, distance: 3.62, color: '#74695f' },
] as const

export const HELIOS_BODIES: HeliosBody[] = [HELIOS_SUN, ...HELIOS_PLANETS, HELIOS_MOON]

export const HELIOS_BODY_BY_ID = Object.fromEntries(
  HELIOS_BODIES.map((body) => [body.id, body]),
) as Record<HeliosBodyId, HeliosBody>

export function heliosDaysSinceJ2000(ms = Date.now()): number {
  return (ms - HELIOS_J2000_MS) / 86_400_000
}

export function heliosDateFromDays(days: number): Date {
  return new Date(HELIOS_J2000_MS + days * 86_400_000)
}

export function heliosVisualSemiMajor(aAu: number): number {
  return HELIOS_AU_SCALE * Math.pow(Math.max(aAu, 1e-6), HELIOS_DISTANCE_EXPONENT)
}

function mod2pi(value: number): number {
  const turn = value % (Math.PI * 2)
  return turn < 0 ? turn + Math.PI * 2 : turn
}

export function heliosSolveKepler(meanAnomaly: number, eccentricity: number): number {
  const m = mod2pi(meanAnomaly)
  let E = eccentricity < 0.8 ? m : Math.PI
  for (let iteration = 0; iteration < 14; iteration += 1) {
    const delta = (E - eccentricity * Math.sin(E) - m) / (1 - eccentricity * Math.cos(E))
    E -= delta
    if (Math.abs(delta) < 1e-10) break
  }
  return E
}

function trueAnomaly(E: number, eccentricity: number): number {
  const beta = Math.sqrt((1 + eccentricity) / Math.max(1 - eccentricity, 1e-12))
  return 2 * Math.atan2(beta * Math.sin(E / 2), Math.cos(E / 2))
}

function eclipticPoint(
  radius: number,
  anomaly: number,
  ascendingNodeDeg: number,
  inclinationDeg: number,
  argumentDeg: number,
) {
  const ascending = ascendingNodeDeg * Math.PI / 180
  const inclination = inclinationDeg * Math.PI / 180
  const argument = argumentDeg * Math.PI / 180 + anomaly
  return {
    x: radius * (Math.cos(ascending) * Math.cos(argument) - Math.sin(ascending) * Math.sin(argument) * Math.cos(inclination)),
    y: radius * (Math.sin(ascending) * Math.cos(argument) + Math.cos(ascending) * Math.sin(argument) * Math.cos(inclination)),
    z: radius * (Math.sin(argument) * Math.sin(inclination)),
  }
}

function toScene(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y]
}

export function heliosPosition(orbit: HeliosOrbit, days: number): [number, number, number] {
  const mean = orbit.M0 * Math.PI / 180 + (Math.PI * 2 / orbit.periodDays) * days
  const E = heliosSolveKepler(mean, orbit.e)
  const anomaly = trueAnomaly(E, orbit.e)
  const a = heliosVisualSemiMajor(orbit.a)
  const radius = a * (1 - orbit.e * Math.cos(E))
  const point = eclipticPoint(radius, anomaly, orbit.Omega, orbit.i, orbit.w)
  return toScene(point.x, point.y, point.z)
}

export function heliosDistanceAu(orbit: HeliosOrbit, days: number): number {
  const mean = orbit.M0 * Math.PI / 180 + (Math.PI * 2 / orbit.periodDays) * days
  const E = heliosSolveKepler(mean, orbit.e)
  return orbit.a * (1 - orbit.e * Math.cos(E))
}

export function heliosOrbitCurve(orbit: HeliosOrbit, samples = 192): [number, number, number][] {
  const points: [number, number, number][] = []
  const a = heliosVisualSemiMajor(orbit.a)
  for (let index = 0; index <= samples; index += 1) {
    const anomaly = index / samples * Math.PI * 2
    const radius = a * (1 - orbit.e * orbit.e) / (1 + orbit.e * Math.cos(anomaly))
    const point = eclipticPoint(radius, anomaly, orbit.Omega, orbit.i, orbit.w)
    points.push(toScene(point.x, point.y, point.z))
  }
  return points
}

export function heliosTrailCurve(
  orbit: HeliosOrbit,
  days: number,
  fraction = 0.16,
  samples = 48,
): [number, number, number][] {
  const points: [number, number, number][] = []
  const span = orbit.periodDays * fraction
  for (let index = 0; index < samples; index += 1) {
    points.push(heliosPosition(orbit, days - index / (samples - 1) * span))
  }
  return points
}
