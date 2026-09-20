import * as THREE from 'three'
import type { HeliosBodyId } from './nexora-helios-model'

type RGB = [number, number, number]

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = a + 0x6d2b79f5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function grid(seed: number, size = 256) {
  const random = mulberry32(seed)
  const out = new Float32Array(size * size)
  for (let index = 0; index < out.length; index += 1) out[index] = random()
  return out
}

function sample(gridData: Float32Array, size: number, x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const mask = size - 1
  const at = (px: number, py: number) => gridData[(px & mask) + (py & mask) * size] ?? 0
  const a = at(xi, yi)
  const b = at(xi + 1, yi)
  const c = at(xi, yi + 1)
  const d = at(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(data: Float32Array, size: number, x: number, y: number, octaves = 5) {
  let sum = 0
  let amplitude = 0.5
  let frequency = 1
  let normalizer = 0
  for (let index = 0; index < octaves; index += 1) {
    sum += amplitude * sample(data, size, x * frequency, y * frequency)
    normalizer += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return sum / normalizer
}

function clamp(value: number, low = 0, high = 1) {
  return Math.max(low, Math.min(high, value))
}

function mix(a: RGB, b: RGB, value: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * value,
    a[1] + (b[1] - a[1]) * value,
    a[2] + (b[2] - a[2]) * value,
  ]
}

function put(data: Uint8ClampedArray, index: number, color: RGB, alpha = 255) {
  const offset = index * 4
  data[offset] = color[0]
  data[offset + 1] = color[1]
  data[offset + 2] = color[2]
  data[offset + 3] = alpha
}

function canvasTexture(width: number, height: number, paint: (data: Uint8ClampedArray) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('canvas-2d-unavailable')
  const image = context.createImageData(width, height)
  paint(image.data)
  context.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

function paintRock(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  seedA: number,
  seedB: number,
  dark: RGB,
  light: RGB,
  craterStrength: number,
) {
  const elevation = grid(seedA)
  const craters = grid(seedB)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / width * 18
      const v = y / height * 9
      const e = fbm(elevation, 256, u, v, 6)
      const crater = fbm(craters, 256, u * 1.8, v * 1.8, 4)
      const depth = Math.pow(clamp(crater - 0.6) * 2.5, 2) * craterStrength
      put(data, y * width + x, mix(dark, light, clamp(e - depth)))
    }
  }
}

function paintVenus(data: Uint8ClampedArray, width: number, height: number) {
  const noise = grid(22)
  for (let y = 0; y < height; y += 1) {
    const latitude = y / height
    for (let x = 0; x < width; x += 1) {
      const swirl = fbm(noise, 256, x / width * 11 + Math.sin(latitude * Math.PI * 6) * 0.7, latitude * 6, 6)
      let color = mix([156, 91, 35], [244, 203, 105], swirl)
      const haze = 0.25 + 0.2 * Math.sin(latitude * Math.PI * 18 + swirl * 5)
      color = mix(color, [255, 232, 171], clamp(haze))
      put(data, y * width + x, color)
    }
  }
}

function paintEarth(data: Uint8ClampedArray, width: number, height: number) {
  const landNoise = grid(7)
  const detailNoise = grid(19)
  const oceanDeep: RGB = [4, 28, 83]
  const ocean: RGB = [10, 92, 183]
  const shelf: RGB = [27, 139, 188]
  const forest: RGB = [29, 104, 57]
  const grass: RGB = [74, 137, 68]
  const desert: RGB = [194, 157, 88]
  const mountain: RGB = [122, 104, 84]
  const ice: RGB = [238, 247, 255]

  for (let y = 0; y < height; y += 1) {
    const lat = (y / (height - 1) - 0.5) * 2
    for (let x = 0; x < width; x += 1) {
      const lon = x / width
      const land = fbm(landNoise, 256, lon * 12.5, y / height * 6.2, 6)
      const detail = fbm(detailNoise, 256, lon * 20, y / height * 10, 5)
      let color: RGB
      if (land > 0.535) {
        const arid = clamp((Math.abs(lat) - 0.08) * 1.25 + detail * 0.28)
        color = mix(forest, grass, clamp(detail * 1.25))
        color = mix(color, desert, arid * 0.68)
        if (land > 0.71) color = mix(color, mountain, clamp((land - 0.71) * 4.5))
      } else {
        color = mix(oceanDeep, ocean, clamp(land * 1.8))
        if (land > 0.49) color = mix(color, shelf, clamp((land - 0.49) * 18))
      }
      const polar = clamp((Math.abs(lat) - 0.73) / 0.27)
      color = mix(color, ice, polar * polar)
      put(data, y * width + x, color)
    }
  }
}

function paintClouds(data: Uint8ClampedArray, width: number, height: number) {
  const noise = grid(33)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const bands = Math.sin(y / height * Math.PI * 12) * 0.08
      const value = fbm(noise, 256, x / width * 15 + bands, y / height * 7, 5)
      const alpha = clamp((value - 0.48) * 3.5) * 190
      put(data, y * width + x, [245, 250, 255], alpha)
    }
  }
}

function paintMars(data: Uint8ClampedArray, width: number, height: number) {
  const a = grid(44)
  const b = grid(45)
  for (let y = 0; y < height; y += 1) {
    const lat = (y / (height - 1) - 0.5) * 2
    for (let x = 0; x < width; x += 1) {
      const terrain = fbm(a, 256, x / width * 14, y / height * 7, 6)
      const dark = fbm(b, 256, x / width * 7, y / height * 3.5, 4)
      let color = mix([92, 35, 24], [218, 91, 45], terrain)
      color = mix(color, [72, 36, 30], clamp((dark - 0.48) * 1.7))
      const ice = clamp((Math.abs(lat) - 0.8) / 0.2)
      color = mix(color, [235, 241, 246], ice)
      put(data, y * width + x, color)
    }
  }
}

function paintJupiter(data: Uint8ClampedArray, width: number, height: number) {
  const noise = grid(55)
  const bands: RGB[] = [
    [237, 215, 181],
    [188, 129, 79],
    [245, 225, 188],
    [160, 94, 60],
    [222, 171, 113],
    [126, 77, 52],
    [238, 210, 163],
    [193, 133, 87],
  ]
  for (let y = 0; y < height; y += 1) {
    const v = y / height
    const bandNoise = fbm(noise, 256, 0.2, v * 16, 4)
    const index = clamp(v * (bands.length - 1) + (bandNoise - 0.5) * 1.7, 0, bands.length - 1.001)
    const i0 = Math.floor(index)
    const base = mix(bands[i0]!, bands[Math.min(i0 + 1, bands.length - 1)]!, index - i0)
    for (let x = 0; x < width; x += 1) {
      const turbulence = fbm(noise, 256, x / width * 23 + Math.sin(v * 32) * 0.9, v * 11, 5)
      let color = mix(base, [112, 61, 44], clamp((turbulence - 0.56) * 2))
      const dx = x / width - 0.64
      const dy = v - 0.38
      const spot = Math.exp(-(dx * dx * 95 + dy * dy * 260))
      color = mix(color, [190, 59, 39], spot * 0.93)
      put(data, y * width + x, color)
    }
  }
}

function paintSaturn(data: Uint8ClampedArray, width: number, height: number) {
  const noise = grid(66)
  const bands: RGB[] = [
    [245, 224, 173],
    [215, 184, 125],
    [250, 232, 188],
    [197, 158, 101],
    [232, 209, 159],
  ]
  for (let y = 0; y < height; y += 1) {
    const v = y / height
    const index = clamp(v * (bands.length - 1), 0, bands.length - 1.001)
    const i0 = Math.floor(index)
    const base = mix(bands[i0]!, bands[Math.min(i0 + 1, bands.length - 1)]!, index - i0)
    for (let x = 0; x < width; x += 1) {
      const detail = fbm(noise, 256, x / width * 18, v * 9, 4)
      put(data, y * width + x, mix(base, [151, 119, 78], clamp((detail - 0.55) * 1.5)))
    }
  }
}

function paintIceGiant(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  a: RGB,
  b: RGB,
  seed: number,
  spot = false,
) {
  const noise = grid(seed)
  for (let y = 0; y < height; y += 1) {
    const v = y / height
    for (let x = 0; x < width; x += 1) {
      const value = fbm(noise, 256, x / width * 11, v * 6.5, 5)
      let color = mix(a, b, value)
      const band = Math.sin(v * Math.PI * 14) * 0.04
      color = mix(color, [225, 255, 255], clamp(0.08 + band))
      if (spot) {
        const dx = x / width - 0.59
        const dy = v - 0.43
        const storm = Math.exp(-(dx * dx * 78 + dy * dy * 180))
        color = mix(color, [20, 38, 112], storm * 0.78)
      }
      put(data, y * width + x, color)
    }
  }
}

function paintSun(data: Uint8ClampedArray, width: number, height: number) {
  const granulation = grid(3)
  const cells = grid(31)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const fine = fbm(granulation, 256, x / width * 28, y / height * 14, 6)
      const broad = fbm(cells, 256, x / width * 9, y / height * 4.5, 4)
      let color = mix([255, 241, 151], [255, 116, 24], clamp((fine - 0.28) * 1.45))
      color = mix(color, [255, 198, 65], broad * 0.3)
      const spot = Math.max(0, fbm(cells, 256, x / width * 22, y / height * 11, 3) - 0.74)
      color = mix(color, [132, 52, 20], clamp(spot * 5))
      put(data, y * width + x, color)
    }
  }
}

export function makeHeliosTexture(id: HeliosBodyId) {
  const large = id === 'sun' || id === 'earth' || id === 'jupiter'
  const width = large ? 640 : 448
  const height = width / 2

  return canvasTexture(width, height, (data) => {
    if (id === 'sun') return paintSun(data, width, height)
    if (id === 'mercury') return paintRock(data, width, height, 11, 91, [72, 67, 64], [191, 178, 163], 0.34)
    if (id === 'venus') return paintVenus(data, width, height)
    if (id === 'earth') return paintEarth(data, width, height)
    if (id === 'mars') return paintMars(data, width, height)
    if (id === 'jupiter') return paintJupiter(data, width, height)
    if (id === 'saturn') return paintSaturn(data, width, height)
    if (id === 'uranus') return paintIceGiant(data, width, height, [86, 180, 188], [175, 236, 230], 88)
    if (id === 'neptune') return paintIceGiant(data, width, height, [18, 61, 173], [77, 142, 245], 99, true)
    return paintRock(data, width, height, 77, 78, [76, 72, 68], [201, 195, 184], 0.4)
  })
}

export function makeHeliosCloudTexture() {
  return canvasTexture(640, 320, (data) => paintClouds(data, 640, 320))
}

export function makeHeliosRingTexture(uranus = false) {
  return canvasTexture(1024, 64, (data) => {
    const random = mulberry32(uranus ? 321 : 123)
    for (let x = 0; x < 1024; x += 1) {
      const t = x / 1023
      let alpha = uranus ? 80 : 220
      if (t < 0.025 || t > 0.985) alpha = 0
      else if (!uranus && t > 0.56 && t < 0.64) alpha = 18
      else if (!uranus && t > 0.77 && t < 0.815) alpha = 55
      else if (uranus && ((t > 0.25 && t < 0.38) || (t > 0.58 && t < 0.7))) alpha = 35
      const noise = 0.72 + random() * 0.28
      const shade = uranus ? 120 + random() * 75 : 190 + random() * 55
      for (let y = 0; y < 64; y += 1) {
        const edge = 1 - Math.abs(y / 63 - 0.5) * 2
        const visible = alpha * clamp(edge * 1.9)
        const color: RGB = uranus
          ? [shade * 0.72, shade * 0.92, shade]
          : [shade, shade * 0.91, shade * 0.73]
        put(data, y * 1024 + x, color, visible * noise)
      }
    }
  })
}
