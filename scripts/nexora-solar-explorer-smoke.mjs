import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

const webPackage = read('apps/web/package.json')
const home = read('apps/web/app/page.tsx')
const fourth = read('apps/web/app/cuarta-dimension/page.tsx')
const page = read('apps/web/app/sistema-solar/page.tsx')
const scene = read('apps/web/components/solar-system/scene.tsx')
const celestial = read('apps/web/components/solar-system/celestial.tsx')
const overlay = read('apps/web/components/solar-system/overlay.tsx')
const labels = read('apps/web/components/solar-system/labels.tsx')
const explorer = read('apps/web/components/solar-system/solar-explorer.tsx')
const textures = read('apps/web/lib/solar-system/textures.ts')
const store = read('apps/web/lib/solar-system/store.ts')
const copy = read('apps/web/lib/solar-system-i18n.ts')

for (const dependency of ['@react-three/fiber', '@react-three/drei', 'three', 'zustand']) {
  assert.ok(webPackage.includes(`"${dependency}"`), `Missing Solar Explorer dependency ${dependency}`)
}

assert.match(home, /href: '\/sistema-solar'[\s\S]*group: projectsGroup/, 'Solar Explorer must be listed under Projects on the public menu')
assert.match(fourth, /href: '\/sistema-solar'[\s\S]*group: t\.groups\.projects/, 'Fourth Dimension must cross-link Solar Explorer')
assert.match(page, /href: '\/cuarta-dimension'[\s\S]*group: t\.groups\.projects/, 'Solar Explorer must cross-link Fourth Dimension')
assert.match(page, /href: '\/sistema-solar'[\s\S]*active: true[\s\S]*group: t\.groups\.projects/, 'Solar Explorer must mark itself active under Projects')
assert.match(page, /<NexoraSolarExplorer locale=\{locale\}/, 'Solar project page must render the 3D explorer')

assert.match(scene, /function ColoredStarField\(/, 'Colored star field missing')
assert.match(scene, /function GalacticMotion\(/, 'Whole-system galactic motion missing')
assert.match(scene, /showGalacticMotion/, 'Galactic motion toggle state missing')
assert.match(scene, /<AsteroidBelt \/>/, 'Asteroid belt missing')
assert.match(scene, /PLANETS\.map/, 'Planet rendering missing')

assert.match(celestial, /export function Sun\(/, 'Sun rendering missing')
assert.match(celestial, /makeSunGlowTexture/, 'Enhanced solar corona missing')
assert.match(celestial, /cloudSpin/, 'Independent Earth cloud motion missing')
assert.match(celestial, /GalileanMoons/, 'Galilean moons missing')
assert.match(celestial, /ringGeometry/, 'Planetary rings missing')

assert.match(textures, /paintEarth/, 'Earth procedural texture missing')
assert.match(textures, /paintJupiter/, 'Jupiter procedural texture missing')
assert.match(textures, /paintSaturn/, 'Saturn procedural texture missing')
assert.match(textures, /paintSun/, 'Sun procedural texture missing')
assert.match(textures, /makeSunGlowTexture/, 'Solar glow texture missing')

assert.match(store, /showGalacticMotion: true/, 'Galactic motion must be enabled by default')
assert.match(store, /galacticSpeed/, 'Galactic speed control missing')
assert.match(overlay, /setShowGalacticMotion/, 'HUD galactic toggle missing')
assert.match(labels, /solarBodyCopy/, 'Localized planet labels missing')
assert.match(explorer, /ssr: false/, 'Three.js scene must be client-only in Next.js')
assert.match(copy, /Nexora Solar Explorer/, 'First-party project name missing')

const integrated = [page, scene, celestial, overlay, labels, explorer, textures, store, copy].join('\n')
assert.doesNotMatch(integrated, /(?:\bGrok\b|__grok|\.grok)/i, 'Integrated Solar Explorer must not contain Grok branding or runtime paths')

console.log('Nexora Solar Explorer smoke passed')
