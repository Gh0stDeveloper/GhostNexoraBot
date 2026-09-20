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
assert.match(textures, /makeHeliosBumpTexture/, 'Phase 1 planetary relief texture missing')
assert.match(textures, /makeHeliosSunDetailTexture/, 'Phase 1 high-detail solar texture missing')
assert.match(experience, /function SunCorona/, 'Phase 1 animated solar corona missing')
assert.match(experience, /DeepSpaceColorField/, 'Phase 1 colored deep-space field missing')
assert.match(experience, /bumpMap=\{bumpMap \?\? undefined\}/, 'Phase 1 relief map is not connected to planet materials')
assert.match(experience, /toneMappingExposure: 1\.28/, 'Phase 1 filmic exposure tuning missing')

assert.match(model, /HELIOS_SYSTEM_TRAVEL_DIRECTION/, 'Phase 2 system travel direction missing')
assert.match(model, /heliosSystemOffset/, 'Phase 2 directional system offset missing')
assert.match(experience, /function WorldTrailLine/, 'Phase 2 world-space planet trajectories missing')
assert.match(experience, /\[HELIOS_SUN, \.\.\.HELIOS_PLANETS\]/, 'Phase 2 Sun trajectory must be rendered with planet trajectories')
assert.match(experience, /type HeliosCameraMode = 'system' \| 'sun' \| 'body' \| 'free'/, 'Phase 2 camera modes missing')
assert.match(experience, /cameraMode === 'system'/, 'Phase 2 system-follow camera control missing')
assert.match(experience, /cameraMode === 'free'/, 'Phase 2 free camera control missing')
assert.match(experience, /travelSpeed/, 'Phase 2 independent travel speed missing')
assert.match(experience, /runtime\.travelSeconds \+= step \* travelSpeed/, 'Phase 2 travel speed must integrate continuously')
assert.doesNotMatch(experience, /Math\.sin\(time \* 0\.045\)/, 'Legacy decorative system wobble must not remain in Phase 2')

assert.match(experience, /type HeliosApproachLevel = 'orbit' \| 'close' \| 'inspect'/, 'Phase 3 multi-stage approach levels missing')
assert.match(experience, /function bodyApproachDistance/, 'Phase 3 body-aware approach distances missing')
assert.match(experience, /function bodyMinimumCameraDistance/, 'Phase 3 surface collision guard missing')
assert.match(experience, /cameraFov\(mode, approachLevel\)/, 'Phase 3 adaptive camera FOV missing')
assert.match(experience, /near: 0\.025/, 'Phase 3 close camera clipping plane missing')
assert.match(experience, /approachLevel === 'inspect'/, 'Phase 3 inspection camera behavior missing')
assert.match(experience, /onApproachChange/, 'Phase 3 approach controls missing')
assert.match(copy, /approachInspect: 'Inspección'/, 'Phase 3 Spanish inspection copy missing')
assert.match(copy, /approachInspect: 'Inspection'/, 'Phase 3 English inspection copy missing')

const migratedSource = [page, experience, model, textures, copy].join('\n').toLowerCase()
assert.doesNotMatch(migratedSource, /grok|xai|__grok/, 'Nexora Helios must not include Grok/xAI branding or platform references')
assert.doesNotMatch(experience, /dangerouslySetInnerHTML|\beval\s*\(/, 'Nexora Helios must not inject raw HTML or evaluate arbitrary code')

console.log('Nexora Helios solar system smoke passed')
