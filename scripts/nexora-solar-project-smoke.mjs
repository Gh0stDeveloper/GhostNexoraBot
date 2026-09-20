import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

const home = read('apps/web/app/page.tsx')
const fourth = read('apps/web/app/cuarta-dimension/page.tsx')
const page = read('apps/web/app/nexora-solar/page.tsx')
const explorer = read('apps/web/components/nexora-solar-explorer.tsx')
const copy = read('apps/web/lib/nexora-solar-i18n.ts')

assert.match(home, /href: '\/nexora-solar'[\s\S]*group: projectsGroup/, 'Public Projects menu must expose Nexora Solar 3D')
assert.match(fourth, /href: '\/nexora-solar'[\s\S]*group: t\.groups\.projects/, 'Fourth Dimension project selector must link to Nexora Solar 3D')
assert.match(page, /brandTitle="NEXORA PROJECTS"/, 'Solar page must remain inside Nexora Projects')
assert.match(page, /href: '#explorador'/, 'Solar page must expose the interactive explorer')
assert.match(page, /href: '#movimiento-galactico'/, 'Solar page must expose the galactic-motion section')

for (const planet of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
  assert.match(explorer, new RegExp(`id: '${planet}'`), `Missing solar body ${planet}`)
}
assert.match(explorer, /function solveKepler\(/, 'Solar explorer must preserve Keplerian orbit propagation')
assert.match(explorer, /function drawPlanetTexture\(/, 'Solar explorer must include procedural planet detail')
assert.match(explorer, /function drawSaturnRings\(/, 'Solar explorer must render Saturn rings')
assert.match(explorer, /galacticMotion/, 'Solar explorer must support galactic travel motion')
assert.match(explorer, /galaxyPhaseRef/, 'Solar explorer must advance a system-level galactic phase')
assert.match(explorer, /showTrails/, 'Solar explorer must support orbital trails')
assert.match(explorer, /#fff8c8/, 'Solar explorer must render a luminous multi-tone Sun')
assert.match(copy, /sistema-solar-3d/, 'Solar copy must preserve source-project attribution without external scaffold branding')

const integrated = `${page}\n${explorer}\n${copy}`
assert.doesNotMatch(integrated, /\bgrok\b|\bxai\b/i, 'Integrated solar project must not contain Grok/xAI branding')
assert.doesNotMatch(explorer, /https?:\/\//i, 'Solar runtime must stay self-contained without external asset URLs')

console.log('Nexora Solar 3D project smoke passed')
