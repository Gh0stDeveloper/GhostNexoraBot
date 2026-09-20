import * as THREE from "three";
import type { BodyId } from "./bodies";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGrid(seed: number, size = 256): Float32Array {
  const rand = mulberry32(seed);
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  return grid;
}

function sampleWrap(grid: Float32Array, size: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const mask = size - 1;
  const at = (ix: number, iy: number) => grid[(ix & mask) + (iy & mask) * size]!;
  const a = at(xi, yi);
  const b = at(xi + 1, yi);
  const c = at(xi, yi + 1);
  const d = at(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(
  grid: Float32Array,
  size: number,
  x: number,
  y: number,
  octaves = 5,
): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < octaves; i++) {
    s += a * sampleWrap(grid, size, x * f, y * f);
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return s / n;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

type RGB = [number, number, number];

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function put(data: Uint8ClampedArray, i: number, rgb: RGB, a = 255): void {
  const p = i * 4;
  data[p] = rgb[0] | 0;
  data[p + 1] = rgb[1] | 0;
  data[p + 2] = rgb[2] | 0;
  data[p + 3] = a;
}

function canvasTex(w: number, h: number, paint: (ctx: CanvasRenderingContext2D, img: ImageData) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d context");
  const img = ctx.createImageData(w, h);
  paint(ctx, img);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function paintMercury(data: Uint8ClampedArray, w: number, h: number): void {
  const n = makeGrid(11);
  const n2 = makeGrid(91);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x / w) * 18;
      const v = (y / h) * 9;
      const elev = fbm(n, 256, u, v, 6);
      const crater = fbm(n2, 256, u * 1.6, v * 1.6, 4);
      const c = clamp(0.38 + elev * 0.42 - Math.pow(clamp(crater - 0.62) * 2.4, 2) * 0.22);
      const rgb: RGB = [c * 210, c * 198, c * 186];
      put(data, y * w + x, rgb);
    }
  }
}

function paintVenus(data: Uint8ClampedArray, w: number, h: number): void {
  const n = makeGrid(22);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const swirl = fbm(n, 256, (x / w) * 10 + Math.sin((y / h) * Math.PI * 4) * 0.4, (y / h) * 6, 5);
      const rgb = mixRgb([210, 170, 96], [236, 214, 164], swirl);
      put(data, y * w + x, rgb);
    }
  }
}

function paintEarth(data: Uint8ClampedArray, w: number, h: number): void {
  const n = makeGrid(7);
  const n2 = makeGrid(19);
  const ocean: RGB = [28, 72, 128];
  const oceanDeep: RGB = [14, 42, 86];
  const grass: RGB = [62, 118, 64];
  const desert: RGB = [186, 156, 96];
  const ice: RGB = [236, 240, 246];
  const mountain: RGB = [122, 118, 108];
  for (let y = 0; y < h; y++) {
    const lat = (y / (h - 1) - 0.5) * 2;
    for (let x = 0; x < w; x++) {
      const lon = x / w;
      const e = fbm(n, 256, lon * 12, (y / h) * 6, 6);
      const e2 = fbm(n2, 256, lon * 18, (y / h) * 9, 4);
      const polar = clamp((Math.abs(lat) - 0.72) / 0.28);
      let rgb: RGB;
      if (e > 0.52) {
        const arid = clamp((Math.abs(lat) - 0.08) * 1.4 + e2 * 0.3);
        rgb = mixRgb(grass, desert, clamp(arid * 0.7));
        if (e > 0.72) rgb = mixRgb(rgb, mountain, clamp((e - 0.72) * 4));
      } else {
        rgb = mixRgb(oceanDeep, ocean, clamp(e * 1.6));
      }
      rgb = mixRgb(rgb, ice, polar * polar);
      put(data, y * w + x, rgb);
    }
  }
}

function paintClouds(data: Uint8ClampedArray, w: number, h: number): void {
  const n = makeGrid(33);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fbm(n, 256, (x / w) * 14, (y / h) * 7, 5);
      const a = clamp((c - 0.5) * 3.2) * 180;
      put(data, y * w + x, [236, 240, 246], a);
    }
  }
}

function paintMars(data: Uint8ClampedArray, w: number, h: number): void {
  const n = makeGrid(44);
  const n2 = makeGrid(45);
  for (let y = 0; y < h; y++) {
    const lat = (y / (h - 1) - 0.5) * 2;
    for (let x = 0; x < w; x++) {
      const e = fbm(n, 256, (x / w) * 14, (y / h) * 7, 6);
      const d = fbm(n2, 256, (x / w) * 6, (y / h) * 3, 3);
      let rgb = mixRgb([118, 52, 32], [196, 118, 72], e);
      rgb = mixRgb(rgb, [92, 48, 34], clamp(d - 0.4));
      const ice = clamp((Math.abs(lat) - 0.78) / 0.22);
      rgb = mixRgb(rgb, [232, 236, 240], ice);
      put(data, y * w + x, rgb);
    }
  }
}

function paintJupiter(data: Uint8ClampedArray, w: number, h: number): void {
  const n = makeGrid(55);
  const bands: RGB[] = [
    [214, 186, 142],
    [176, 132, 86],
    [228, 208, 164],
    [164, 108, 72],
    [210, 170, 120],
    [140, 96, 64],
    [222, 198, 154],
  ];
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const band = fbm(n, 256, 0.2, v * 14, 4);
    const idx = clamp(v * (bands.length - 1) + (band - 0.5) * 1.4, 0, bands.length - 1.001);
    const i0 = Math.floor(idx);
    const t = idx - i0;
    let rgb = mixRgb(bands[i0]!, bands[Math.min(i0 + 1, bands.length - 1)]!, t);
    for (let x = 0; x < w; x++) {
      const turbulence = fbm(n, 256, (x / w) * 20 + Math.sin(v * 28) * 0.8, v * 10, 5);
      const local = mixRgb(rgb, [120, 72, 48], clamp((turbulence - 0.58) * 2));
      const dx = x / w - 0.62;
      const dy = v - 0.38;
      const spot = Math.exp(-(dx * dx * 90 + dy * dy * 220));
      const withSpot = mixRgb(local, [176, 72, 48], spot * 0.85);
      put(data, y * w + x, withSpot);
    }
  }
}

function paintSaturn(data: Uint8ClampedArray, w: number, h: number): void {
  const n = makeGrid(66);
  const bands: RGB[] = [
    [232, 214, 170],
    [210, 186, 140],
    [240, 226, 188],
    [196, 168, 122],
    [226, 206, 164],
  ];
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const idx = clamp(v * (bands.length - 1), 0, bands.length - 1.001);
    const i0 = Math.floor(idx);
    const base = mixRgb(bands[i0]!, bands[Math.min(i0 + 1, bands.length - 1)]!, idx - i0);
    for (let x = 0; x < w; x++) {
      const t = fbm(n, 256, (x / w) * 16, v * 8, 4);
      put(data, y * w + x, mixRgb(base, [168, 140, 96], clamp((t - 0.55) * 1.6)));
    }
  }
}

function paintIceGiant(data: Uint8ClampedArray, w: number, h: number, a: RGB, b: RGB, seed: number, spot = false): void {
  const n = makeGrid(seed);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const t = fbm(n, 256, (x / w) * 10, v * 6, 5);
      let rgb = mixRgb(a, b, t);
      if (spot) {
        const dx = x / w - 0.58;
        const dy = v - 0.42;
        const s = Math.exp(-(dx * dx * 70 + dy * dy * 160));
        rgb = mixRgb(rgb, [28, 48, 96], s * 0.7);
      }
      put(data, y * w + x, rgb);
    }
  }
}

function paintSun(data: Uint8ClampedArray, w: number, h: number): void {
  const n = makeGrid(3);
  const spots = makeGrid(303);
  for (let y = 0; y < h; y++) {
    const lat = (y / h - 0.5) * Math.PI;
    for (let x = 0; x < w; x++) {
      const g = fbm(n, 256, (x / w) * 30, (y / h) * 15, 7);
      const filament = Math.sin((x / w) * Math.PI * 42 + g * 5) * 0.5 + 0.5;
      const spotNoise = fbm(spots, 256, (x / w) * 8, (y / h) * 4, 5);
      const limb = 0.88 + Math.cos(lat) * 0.12;
      let rgb = mixRgb([255, 238, 166], [255, 126, 28], clamp((g - 0.28) * 1.65));
      rgb = mixRgb(rgb, [255, 198, 72], filament * 0.28);
      if (spotNoise > 0.73) rgb = mixRgb(rgb, [108, 42, 18], clamp((spotNoise - 0.73) * 3.5));
      put(data, y * w + x, rgb.map((v) => v * limb) as RGB);
    }
  }
}

export function makeSunGlowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,248,214,1)");
  gradient.addColorStop(0.18, "rgba(255,201,92,.88)");
  gradient.addColorStop(0.42, "rgba(255,126,28,.42)");
  gradient.addColorStop(0.72, "rgba(255,84,10,.12)");
  gradient.addColorStop(1, "rgba(255,64,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function paintMoon(data: Uint8ClampedArray, w: number, h: number): void {
  const n = makeGrid(77);
  const n2 = makeGrid(78);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const e = fbm(n, 256, (x / w) * 16, (y / h) * 8, 6);
      const crater = fbm(n2, 256, (x / w) * 22, (y / h) * 11, 4);
      const c = clamp(0.45 + e * 0.4 - Math.pow(clamp(crater - 0.66) * 2.8, 2) * 0.3);
      put(data, y * w + x, [c * 230, c * 224, c * 214]);
    }
  }
}

export function makePlanetTexture(id: BodyId): THREE.CanvasTexture {
  const big = id === "jupiter" || id === "earth" || id === "sun";
  const w = big ? 512 : 384;
  const h = w / 2;
  return canvasTex(w, h, (_ctx, img) => {
    const data = img.data;
    switch (id) {
      case "mercury":
        paintMercury(data, w, h);
        break;
      case "venus":
        paintVenus(data, w, h);
        break;
      case "earth":
        paintEarth(data, w, h);
        break;
      case "mars":
        paintMars(data, w, h);
        break;
      case "jupiter":
        paintJupiter(data, w, h);
        break;
      case "saturn":
        paintSaturn(data, w, h);
        break;
      case "uranus":
        paintIceGiant(data, w, h, [132, 196, 198], [176, 222, 224], 88);
        break;
      case "neptune":
        paintIceGiant(data, w, h, [46, 86, 176], [96, 148, 220], 99, true);
        break;
      case "sun":
        paintSun(data, w, h);
        break;
      case "moon":
        paintMoon(data, w, h);
        break;
    }
  });
}

export function makeCloudTexture(): THREE.CanvasTexture {
  return canvasTex(512, 256, (_ctx, img) => paintClouds(img.data, 512, 256));
}

export function makeRingTexture(): THREE.CanvasTexture {
  return canvasTex(1024, 64, (_ctx, img) => {
    const { data } = img;
    const w = 1024;
    const h = 64;
    const rand = mulberry32(123);
    for (let x = 0; x < w; x++) {
      const t = x / (w - 1);
      let a = 210;
      if (t < 0.04 || t > 0.98) a = 0;
      else if (t > 0.58 && t < 0.66) a = 18;
      else if (t > 0.78 && t < 0.81) a = 50;
      const n = 0.75 + rand() * 0.25;
      const shade = (200 + rand() * 40) * n;
      for (let y = 0; y < h; y++) {
        const edge = 1 - Math.abs(y / (h - 1) - 0.5) * 2;
        const aa = a * clamp(edge * 1.8);
        put(data, y * w + x, [shade, shade * 0.92, shade * 0.78], aa);
      }
    }
  });
}
