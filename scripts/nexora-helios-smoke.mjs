import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

const webPackage = read('apps/web/package.json')
const home = read('apps/web/app/page.tsx')
const fourthDimension = read('apps/web/app/cuarta-dimension/page.tsx')
const page = read('apps/web/app/sistema-solar/page.tsx')
const experience = read('apps/web/components/nexora-helios.tsx')
const model = read('apps/web/lib/nexora-helios-model.ts')
const textures = read('apps/web/lib/nexora-helios-textures.ts')
const copy = read('apps/web/lib/nexora-helios-i18n.ts')

for (const dependency of ['@react-three/fiber', '@react-three/drei', 'three']) {
  assert.ok(webPackage.includes(`"${dependency}"`), `Missing 3D dependency ${dependency}`)
}

assert.match(home, /href: '\/sistema-solar'[\s\S]*group: projectsGroup/, 'Nexora Helios must appear under Projects on the public menu')
assert.match(fourthDimension, /href: '\/sistema-solar'/, 'Fourth Dimension must cross-link Nexora Helios')
assert.match(page, /brandTitle="NEXORA PROJECTS"/, 'Nexora Helios must use the Projects shell')
assert.match(page, /href: '\/cuarta-dimension'/, 'Nexora Helios must expose the sibling Fourth Dimension project')
assert.match(page, /href: '#observatorio'/, 'Nexora Helios observatory anchor missing')
assert.match(page, /href: '#movimiento-galactico'/, 'Nexora Helios galactic motion anchor missing')
assert.match(page, /href: '#datos-sistema'/, 'Nexora Helios data anchor missing')

assert.match(experience, /function SystemMotion/, 'Whole-system motion component missing')
assert.match(experience, /GalacticStarFlow/, 'Galactic stellar flow missing')
assert.match(experience, /MilkyWayBand/, 'Milky Way star band missing')
assert.match(experience, /makeHeliosCloudTexture/, 'Earth cloud layer missing')
assert.match(experience, /makeHeliosRingTexture/, 'Planet ring rendering missing')
assert.match(experience, /AsteroidBelt/, 'Asteroid belt missing')
assert.match(experience, /GalileanMoons/, 'Galilean moons missing')
assert.match(experience, /toneMapping: THREE\.ACESFilmicToneMapping/, 'Filmic tone mapping missing')

for (const body of ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'moon']) {
  assert.ok(copy.includes(`${body}: {`), `Missing localized body copy for ${body}`)
}
assert.match(model, /moons: 115/, 'Current Jupiter moon count missing')
assert.match(model, /moons: 293/, 'Current Saturn moon count missing')
assert.match(model, /moons: 29/, 'Current Uranus moon count missing')
assert.match(model, /moons: 16/, 'Current Neptune moon count missing')

assert.match(textures, /paintEarth/, 'Earth procedural texture missing')
assert.match(textures, /paintJupiter/, 'Jupiter procedural texture missing')
assert.match(textures, /paintSun/, 'Sun procedural texture missing')

const migratedSource = [page, experience, model, textures, copy].join('\n').toLowerCase()
assert.doesNotMatch(migratedSource, /grok|xai|__grok/, 'Nexora Helios must not include Grok/xAI branding or platform references')
assert.doesNotMatch(experience, /dangerouslySetInnerHTML|\beval\s*\(/, 'Nexora Helios must not inject raw HTML or evaluate arbitrary code')

console.log('Nexora Helios solar system smoke passed')
