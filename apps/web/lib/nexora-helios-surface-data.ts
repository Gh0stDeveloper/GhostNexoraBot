import type { HeliosBodyId } from './nexora-helios-model'

export type HeliosSurfaceId = Extract<HeliosBodyId, 'mercury' | 'venus' | 'earth' | 'mars' | 'moon'>

export type HeliosSurfaceProjection =
  | 'simple-cylindrical'
  | 'cylindrical'
  | 'global-radar-view'
  | 'global-topography-view'
  | 'global-base-map'

export type HeliosSurfaceDataset = {
  id: HeliosSurfaceId
  dataset: string
  mission: string
  instrument: string
  provider: string
  coverage: 'global'
  projection: HeliosSurfaceProjection
  coordinateMap: boolean
  resolution: string
  verticalRange?: string
  datum?: string
  imageUrl: string
  sourceUrl: string
  credit: string
}

export const HELIOS_SURFACE_DATASETS: Record<HeliosSurfaceId, HeliosSurfaceDataset> = {
  mercury: {
    id: 'mercury',
    dataset: 'MESSENGER MDIS Global Digital Elevation Model',
    mission: 'MESSENGER',
    instrument: 'Mercury Dual Imaging System (MDIS)',
    provider: 'NASA Planetary Data System',
    coverage: 'global',
    projection: 'global-topography-view',
    coordinateMap: false,
    resolution: '665 m global DEM',
    verticalRange: '−3.733 km to +5.310 km',
    datum: 'Elevation relative to the 2,439.4 km Mercury reference radius',
    imageUrl: 'https://svs.gsfc.nasa.gov/vis/a030000/a030800/a030820/mercury_messenger_elevation_usgs_clrshade_print.jpg',
    sourceUrl: 'https://pds.nasa.gov/ds-view/pds/viewDataset.jsp?dsid=MESS-H-MDIS-5-DEM-ELEVATION-V1.0',
    credit: 'NASA / USGS / Arizona State University / Carnegie Institution of Washington / JHUAPL',
  },
  venus: {
    id: 'venus',
    dataset: 'Magellan global radar mosaic and topography',
    mission: 'Magellan',
    instrument: 'Synthetic Aperture Radar / Radar Altimeter',
    provider: 'NASA/JPL + NASA Planetary Data System',
    coverage: 'global',
    projection: 'global-radar-view',
    coordinateMap: false,
    resolution: 'Global radar mosaic; topography model from Magellan altimetry',
    imageUrl: 'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia00/pia00478/PIA00478.jpg?crop=faces%2Cfocalpoint&fit=clip&h=2048&w=2048',
    sourceUrl: 'https://pds.nasa.gov/ds-view/pds/viewDataset.jsp?dsid=MGN-V-RDRS-5-TOPO-L2-V1.0',
    credit: 'NASA / Jet Propulsion Laboratory',
  },
  earth: {
    id: 'earth',
    dataset: 'NASA Earth Observatory Explorer Base Map',
    mission: 'NASA Earth-observing missions',
    instrument: 'Multi-mission Earth observation composite',
    provider: 'NASA Earth Observatory',
    coverage: 'global',
    projection: 'global-base-map',
    coordinateMap: false,
    resolution: '3,600 × 1,800 web map; higher-resolution source products are available',
    imageUrl: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/147000/147190/eo_base_2020_clean_3600x1800.png',
    sourceUrl: 'https://visibleearth.nasa.gov/images/147190/explorer-base-map',
    credit: 'NASA Earth Observatory',
  },
  mars: {
    id: 'mars',
    dataset: 'Mars Global Surveyor MOLA global topography',
    mission: 'Mars Global Surveyor',
    instrument: 'Mars Orbiter Laser Altimeter (MOLA)',
    provider: 'NASA Goddard / USGS Astrogeology',
    coverage: 'global',
    projection: 'global-topography-view',
    coordinateMap: false,
    resolution: '463 m/pixel global DEM',
    verticalRange: 'MOLA elevation relative to the Martian areoid',
    datum: 'Average point accuracy ≈100 m horizontal and ≈1 m in radius; global elevation uncertainty at least ±3 m',
    imageUrl: 'https://svs.gsfc.nasa.gov/vis/a000000/a001000/a001090/a001090.00005_print.png',
    sourceUrl: 'https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m',
    credit: 'NASA Goddard Space Flight Center / MOLA Science Team / USGS Astrogeology',
  },
  moon: {
    id: 'moon',
    dataset: 'LRO LOLA global elevation map',
    mission: 'Lunar Reconnaissance Orbiter',
    instrument: 'Lunar Orbiter Laser Altimeter (LOLA)',
    provider: 'NASA Goddard Scientific Visualization Studio',
    coverage: 'global',
    projection: 'cylindrical',
    coordinateMap: true,
    resolution: '5,760 × 2,880 cylindrical elevation map; 1,024 × 512 web preview',
    datum: 'LOLA laser-altimetry elevation with shaded relief',
    imageUrl: 'https://svs.gsfc.nasa.gov/vis/a000000/a004000/a004014/LDEM_16.0centered.0centered_print.jpg',
    sourceUrl: 'https://svs.gsfc.nasa.gov/4014',
    credit: 'NASA Goddard Space Flight Center Scientific Visualization Studio / LRO LOLA',
  },
}

export function hasHeliosSurfaceDataset(id: HeliosBodyId | null): id is HeliosSurfaceId {
  return Boolean(id && id in HELIOS_SURFACE_DATASETS)
}

export function heliosSurfaceDataset(id: HeliosSurfaceId) {
  return HELIOS_SURFACE_DATASETS[id]
}
