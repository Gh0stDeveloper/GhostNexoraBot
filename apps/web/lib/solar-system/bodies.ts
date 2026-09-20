import type { OrbitalElements } from "./kepler";

export type BodyId =
  | "sun"
  | "mercury"
  | "venus"
  | "earth"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "moon";

export type BodyKind = "star" | "planet" | "moon";

export type BodyDef = {
  id: BodyId;
  name: string;
  latin: string;
  kind: BodyKind;
  parent?: BodyId;
  orbit?: OrbitalElements;
  rotationDays: number;
  obliquity: number;
  radiusKm: number;
  massCoeff: number;
  massExp: number;
  gravity: number;
  moons: number;
  temp: string;
  visualRadius: number;
  color: string;
  atmosphere?: string;
  roughness: number;
  metalness: number;
  blurb: string;
  typeLabel: string;
  rings?: { inner: number; outer: number };
};

/** J2000 Keplerian elements (JPL approximate ephemeris, 1800–2050). */
export const SUN: BodyDef = {
  id: "sun",
  name: "Sol",
  latin: "Sol",
  kind: "star",
  rotationDays: 25.38,
  obliquity: 7.25,
  radiusKm: 695700,
  massCoeff: 1.9885,
  massExp: 30,
  gravity: 274,
  moons: 0,
  temp: "5.772 K (fotosfera)",
  visualRadius: 2.55,
  color: "#ffd19a",
  roughness: 0.4,
  metalness: 0,
  typeLabel: "Estrella G2V",
  blurb:
    "Estrella de secuencia principal que concentra el 99,8 % de la masa del sistema. La fusión de hidrógeno en su núcleo sostiene el clima de todos los planetas.",
};

export const PLANETS: BodyDef[] = [
  {
    id: "mercury",
    name: "Mercurio",
    latin: "Mercurius",
    kind: "planet",
    orbit: {
      a: 0.38709927,
      e: 0.20563593,
      i: 7.00497902,
      Omega: 48.33076593,
      w: 29.12703035,
      M0: 174.79252722,
      periodDays: 87.969,
    },
    rotationDays: 58.646,
    obliquity: 0.034,
    radiusKm: 2439.7,
    massCoeff: 3.301,
    massExp: 23,
    gravity: 3.7,
    moons: 0,
    temp: "−173 a 427 °C",
    visualRadius: 0.42,
    color: "#9a8f86",
    roughness: 0.92,
    metalness: 0.12,
    typeLabel: "Planeta telúrico",
    blurb:
      "El más cercano al Sol y el de órbita más excéntrica. Un día solar dura 176 días terrestres; su núcleo de hierro es desproporcionadamente grande.",
  },
  {
    id: "venus",
    name: "Venus",
    latin: "Venus",
    kind: "planet",
    orbit: {
      a: 0.72333566,
      e: 0.00677672,
      i: 3.39467605,
      Omega: 76.67984255,
      w: 54.92262463,
      M0: 50.37663232,
      periodDays: 224.701,
    },
    rotationDays: -243.025,
    obliquity: 177.36,
    radiusKm: 6051.8,
    massCoeff: 4.867,
    massExp: 24,
    gravity: 8.87,
    moons: 0,
    temp: "464 °C (superficie)",
    visualRadius: 0.78,
    color: "#d9c39a",
    atmosphere: "#ead7b0",
    roughness: 0.55,
    metalness: 0.02,
    typeLabel: "Planeta telúrico",
    blurb:
      "Rota al revés y más lento que su año. Una atmósfera de CO₂ con nubes de ácido sulfúrico produce el mayor efecto invernadero del sistema.",
  },
  {
    id: "earth",
    name: "Tierra",
    latin: "Terra",
    kind: "planet",
    orbit: {
      a: 1.00000261,
      e: 0.01671123,
      i: 0.00001531,
      Omega: 0,
      w: 102.93768193,
      M0: 357.52688973,
      periodDays: 365.256,
    },
    rotationDays: 0.997269,
    obliquity: 23.44,
    radiusKm: 6371,
    massCoeff: 5.972,
    massExp: 24,
    gravity: 9.8,
    moons: 1,
    temp: "15 °C (media)",
    visualRadius: 0.82,
    color: "#6ea4d4",
    atmosphere: "#8ec7ff",
    roughness: 0.48,
    metalness: 0.04,
    typeLabel: "Planeta telúrico",
    blurb:
      "Único mundo conocido con agua líquida estable y vida. La Luna estabiliza su oblicuidad; el perihelio cae a principios de enero.",
  },
  {
    id: "mars",
    name: "Marte",
    latin: "Mars",
    kind: "planet",
    orbit: {
      a: 1.52371034,
      e: 0.0933941,
      i: 1.84969142,
      Omega: 49.55953891,
      w: 286.4968315,
      M0: 19.39019754,
      periodDays: 686.98,
    },
    rotationDays: 1.025957,
    obliquity: 25.19,
    radiusKm: 3389.5,
    massCoeff: 6.417,
    massExp: 23,
    gravity: 3.71,
    moons: 2,
    temp: "−63 °C (media)",
    visualRadius: 0.52,
    color: "#c4845a",
    atmosphere: "#e39a72",
    roughness: 0.86,
    metalness: 0.04,
    typeLabel: "Planeta telúrico",
    blurb:
      "Un día casi terrestre (24 h 37 min) y estaciones marcadas. Los casquetes de hielo de CO₂ y agua crecen y menguan con su año de 687 días.",
  },
  {
    id: "jupiter",
    name: "Júpiter",
    latin: "Iuppiter",
    kind: "planet",
    orbit: {
      a: 5.202887,
      e: 0.04838624,
      i: 1.30439695,
      Omega: 100.47390909,
      w: 274.25457074,
      M0: 19.66796068,
      periodDays: 4332.589,
    },
    rotationDays: 0.41354,
    obliquity: 3.13,
    radiusKm: 69911,
    massCoeff: 1.898,
    massExp: 27,
    gravity: 24.79,
    moons: 95,
    temp: "−108 °C (nubes)",
    visualRadius: 2.32,
    color: "#c9a078",
    atmosphere: "#d7b48a",
    roughness: 0.42,
    metalness: 0.02,
    typeLabel: "Gigante gaseoso",
    blurb:
      "Más masivo que el resto de planetas juntos. La Gran Mancha Roja es un anticiclón más ancho que la Tierra; sus lunas galileanas son mundos por derecho propio.",
  },
  {
    id: "saturn",
    name: "Saturno",
    latin: "Saturnus",
    kind: "planet",
    orbit: {
      a: 9.53667594,
      e: 0.05386179,
      i: 2.48599187,
      Omega: 113.66242448,
      w: 338.93645383,
      M0: 317.35536592,
      periodDays: 10759.22,
    },
    rotationDays: 0.44401,
    obliquity: 26.73,
    radiusKm: 58232,
    massCoeff: 5.683,
    massExp: 26,
    gravity: 10.44,
    moons: 146,
    temp: "−139 °C (nubes)",
    visualRadius: 2.02,
    color: "#e6d2a8",
    atmosphere: "#ead9b4",
    roughness: 0.4,
    metalness: 0.03,
    rings: { inner: 1.32, outer: 2.28 },
    typeLabel: "Gigante gaseoso",
    blurb:
      "Densidad menor que el agua. El sistema de anillos, de hielo y polvo, se extiende cientos de miles de kilómetros con apenas decenas de metros de espesor.",
  },
  {
    id: "uranus",
    name: "Urano",
    latin: "Uranus",
    kind: "planet",
    orbit: {
      a: 19.18916464,
      e: 0.04725744,
      i: 0.77263783,
      Omega: 74.01692503,
      w: 96.93735127,
      M0: 142.28382821,
      periodDays: 30685.4,
    },
    rotationDays: -0.71833,
    obliquity: 97.77,
    radiusKm: 25362,
    massCoeff: 8.681,
    massExp: 25,
    gravity: 8.69,
    moons: 28,
    temp: "−195 °C",
    visualRadius: 1.22,
    color: "#9fd0d4",
    atmosphere: "#b7e0e2",
    roughness: 0.38,
    metalness: 0.04,
    typeLabel: "Gigante de hielo",
    blurb:
      "Rueda de lado: su eje está casi en el plano de la órbita, quizá por un impacto primordial. Metano en la atmósfera le da el color cian.",
  },
  {
    id: "neptune",
    name: "Neptuno",
    latin: "Neptunus",
    kind: "planet",
    orbit: {
      a: 30.06992276,
      e: 0.00859048,
      i: 1.77004347,
      Omega: 131.78422574,
      w: 273.18698507,
      M0: 259.9087595,
      periodDays: 60189,
    },
    rotationDays: 0.67125,
    obliquity: 28.32,
    radiusKm: 24622,
    massCoeff: 1.024,
    massExp: 26,
    gravity: 11.15,
    moons: 16,
    temp: "−201 °C",
    visualRadius: 1.18,
    color: "#4f7fd4",
    atmosphere: "#6f9aee",
    roughness: 0.36,
    metalness: 0.05,
    typeLabel: "Gigante de hielo",
    blurb:
      "El primero predicho con papel y lápiz, antes de verse. Vientos de más de 2.000 km/h y un calor interno que aún no se explica del todo.",
  },
];

export const MOON: BodyDef = {
  id: "moon",
  name: "Luna",
  latin: "Luna",
  kind: "moon",
  parent: "earth",
  orbit: {
    a: 0.00257,
    e: 0.0549,
    i: 5.145,
    Omega: 125.08,
    w: 318.15,
    M0: 135.27,
    periodDays: 27.321582,
  },
  rotationDays: 27.321582,
  obliquity: 6.68,
  radiusKm: 1737.4,
  massCoeff: 7.342,
  massExp: 22,
  gravity: 1.62,
  moons: 0,
  temp: "−173 a 127 °C",
  visualRadius: 0.22,
  color: "#b9b3aa",
  roughness: 0.95,
  metalness: 0.08,
  typeLabel: "Satélite natural",
  blurb:
    "Rotación síncrona: siempre muestra la misma cara. Su distancia visual aquí está exagerada; en la realidad cabe ~30 Tierras entre ambos.",
};

export const GALILEAN = [
  { id: "io", name: "Ío", periodDays: 1.769, radius: 0.11, distance: 1.72, color: "#e4c56a" },
  { id: "europa", name: "Europa", periodDays: 3.551, radius: 0.1, distance: 2.18, color: "#d8cbb8" },
  { id: "ganymede", name: "Ganimedes", periodDays: 7.155, radius: 0.15, distance: 2.82, color: "#b5a489" },
  { id: "callisto", name: "Calisto", periodDays: 16.689, radius: 0.13, distance: 3.55, color: "#7a7368" },
] as const;

export const BODIES: BodyDef[] = [SUN, ...PLANETS, MOON];

export const NAV_BODIES: BodyDef[] = [SUN, ...PLANETS];

export const BODY_BY_ID: Record<BodyId, BodyDef> = Object.fromEntries(
  BODIES.map((b) => [b.id, b]),
) as Record<BodyId, BodyDef>;

export const AU_KM = 149_597_870.7;

export function isBodyId(value: string): value is BodyId {
  return value in BODY_BY_ID;
}
