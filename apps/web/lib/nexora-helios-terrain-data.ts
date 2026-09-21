import type { HeliosSurfaceId } from './nexora-helios-surface-data'

export type HeliosTerrainProvider = 'nasa-trek' | 'usgs-3dep'

export type HeliosTerrainRegion = {
  id: string
  body: HeliosSurfaceId
  nameEs: string
  nameEn: string
  latitude?: number
  longitude?: number
  zoom?: number
  provider: HeliosTerrainProvider
  dataset: string
  sourceUrl: string
  viewerUrl: string
  noteEs: string
  noteEn: string
}

function trekUrl(
  body: 'mars' | 'moon' | 'mercury' | 'venus',
  longitude: number,
  latitude: number,
  zoom: number,
  projection?: string,
) {
  const params = new URLSearchParams({
    v: '0.1',
    x: String(longitude),
    y: String(latitude),
    z: String(zoom),
    d: '',
    locale: '',
    b: body,
    sfz: '',
    w: '',
  })
  if (projection) params.set('p', projection)
  return `https://trek.nasa.gov/${body}/#${params.toString()}`
}

const MARS_EQ = 'urn:ogc:def:crs:EPSG::104905'
const MOON_EQ = 'urn:ogc:def:crs:EPSG::104903'

export const HELIOS_TERRAIN_REGIONS: HeliosTerrainRegion[] = [
  {
    id: 'mars-olympus-mons',
    body: 'mars',
    nameEs: 'Olympus Mons',
    nameEn: 'Olympus Mons',
    latitude: 18.65,
    longitude: -133.8,
    zoom: 5,
    provider: 'nasa-trek',
    dataset: 'Mars Trek · MGS MOLA / HRSC terrain products',
    sourceUrl: 'https://trek.nasa.gov/mars/',
    viewerUrl: trekUrl('mars', -133.8, 18.65, 5, MARS_EQ),
    noteEs: 'Centro del edificio volcánico según el Gazetteer de nomenclatura planetaria de USGS. El visor 3D usa productos de elevación publicados en Mars Trek.',
    noteEn: 'Volcanic edifice center from the USGS Gazetteer of Planetary Nomenclature. The 3D viewer uses elevation products published in Mars Trek.',
  },
  {
    id: 'mars-gale-crater',
    body: 'mars',
    nameEs: 'Cráter Gale',
    nameEn: 'Gale Crater',
    latitude: -4.49,
    longitude: 137.42,
    zoom: 8,
    provider: 'nasa-trek',
    dataset: 'Mars Trek · MOLA / CTX / HiRISE products',
    sourceUrl: 'https://trek.nasa.gov/mars/',
    viewerUrl: trekUrl('mars', 137.42, -4.49, 8, MARS_EQ),
    noteEs: 'Región del sitio de Curiosity. Mars Trek permite combinar topografía MOLA con mosaicos orbitales de mayor resolución.',
    noteEn: 'Curiosity landing region. Mars Trek can combine MOLA topography with higher-resolution orbital mosaics.',
  },
  {
    id: 'mars-valles-marineris',
    body: 'mars',
    nameEs: 'Valles Marineris',
    nameEn: 'Valles Marineris',
    latitude: -4.1,
    longitude: -35.2,
    zoom: 6,
    provider: 'nasa-trek',
    dataset: 'Mars Trek · MGS MOLA terrain',
    sourceUrl: 'https://trek.nasa.gov/mars/',
    viewerUrl: trekUrl('mars', -35.2, -4.1, 6, MARS_EQ),
    noteEs: 'Punto de referencia en el extremo oriental del sistema de cañones, respaldado por cartografía NASA/USGS.',
    noteEn: 'Reference point near the eastern canyon system, backed by NASA/USGS mapping.',
  },
  {
    id: 'moon-tycho',
    body: 'moon',
    nameEs: 'Cráter Tycho',
    nameEn: 'Tycho Crater',
    latitude: -43.37,
    longitude: -11.32,
    zoom: 7,
    provider: 'nasa-trek',
    dataset: 'Moon Trek · LRO LOLA / LROC terrain products',
    sourceUrl: 'https://trek.nasa.gov/moon/',
    viewerUrl: trekUrl('moon', -11.32, -43.37, 7, MOON_EQ),
    noteEs: 'Tycho está centrado aproximadamente en 43.37° S, 348.68° E. Moon Trek usa productos LRO/LOLA para relieve y análisis.',
    noteEn: 'Tycho is centered near 43.37° S, 348.68° E. Moon Trek uses LRO/LOLA products for terrain and analysis.',
  },
  {
    id: 'mercury-caloris',
    body: 'mercury',
    nameEs: 'Cuenca Caloris',
    nameEn: 'Caloris Basin',
    latitude: 31.5,
    longitude: 162.7,
    zoom: 5,
    provider: 'nasa-trek',
    dataset: 'Mercury Trek · MESSENGER terrain products',
    sourceUrl: 'https://trek.nasa.gov/mercury/',
    viewerUrl: trekUrl('mercury', 162.7, 31.5, 5),
    noteEs: 'Región centrada en 31.5° N, 162.7° E, cartografiada por MESSENGER. Mercury Trek expone datos científicos y herramientas 3D.',
    noteEn: 'Region centered at 31.5° N, 162.7° E, mapped by MESSENGER. Mercury Trek exposes scientific data and 3D tools.',
  },
  {
    id: 'venus-maxwell',
    body: 'venus',
    nameEs: 'Maxwell Montes',
    nameEn: 'Maxwell Montes',
    latitude: 65,
    longitude: 6,
    zoom: 6,
    provider: 'nasa-trek',
    dataset: 'Venus Trek · Magellan radar and topography',
    sourceUrl: 'https://trek.nasa.gov/venus/',
    viewerUrl: trekUrl('venus', 6, 65, 6),
    noteEs: 'Maxwell Montes está centrado cerca de 65° N, 6° E. El relieve procede de radar y altimetría de Magellan.',
    noteEn: 'Maxwell Montes is centered near 65° N, 6° E. Terrain comes from Magellan radar and altimetry.',
  },
  {
    id: 'earth-usgs-3dep',
    body: 'earth',
    nameEs: 'USGS National Map 3D',
    nameEn: 'USGS National Map 3D',
    provider: 'usgs-3dep',
    dataset: 'USGS 3D Elevation Program (3DEP)',
    sourceUrl: 'https://www.usgs.gov/3d-elevation-program',
    viewerUrl: 'https://apps.nationalmap.gov/viewer/',
    noteEs: 'Visor oficial 3D de The National Map. Utiliza productos 3DEP para explorar topografía terrestre de Estados Unidos.',
    noteEn: 'Official 3D viewer from The National Map. It uses 3DEP products to explore United States topography.',
  },
]

export function heliosTerrainRegions(id: HeliosSurfaceId) {
  return HELIOS_TERRAIN_REGIONS.filter((region) => region.body === id)
}

export function hasHeliosTerrainRegions(id: HeliosSurfaceId) {
  return HELIOS_TERRAIN_REGIONS.some((region) => region.body === id)
}
