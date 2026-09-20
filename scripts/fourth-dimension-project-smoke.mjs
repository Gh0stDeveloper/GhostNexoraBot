import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

const navigation = read('apps/web/components/unified-navigation.tsx')
const home = read('apps/web/app/page.tsx')
const page = read('apps/web/app/cuarta-dimension/page.tsx')
const explorer = read('apps/web/components/fourth-dimension-explorer.tsx')
const labs = read('apps/web/components/fourth-dimension-labs.tsx')
const copy = read('apps/web/lib/fourth-dimension-i18n.ts')

assert.match(navigation, /group\?: string/, 'Unified navigation must support optional groups')
assert.match(navigation, /showGroup/, 'Grouped navigation headings must render in desktop and drawer navigation')
assert.match(navigation, /item\.group\?\.toLowerCase\(\)/, 'Navigation search must include group names')

assert.match(home, /const projectsGroup = locale === 'en' \? 'PROJECTS' : 'PROYECTOS'/, 'Public menu must expose a localized Projects group')
assert.match(home, /href: '\/cuarta-dimension'[\s\S]*group: projectsGroup/, 'Fourth Dimension must live under the Projects group')
assert.match(home, /href: '#seguridad'[\s\S]*group: nexoraGroup/, 'Nexora bot sections must remain separated from Projects')

assert.match(page, /group: t\.groups\.nexora/, 'Fourth Dimension page must retain a Nexora global group')
assert.match(page, /group: t\.groups\.projects/, 'Fourth Dimension page must expose the project selector group')
assert.match(page, /group: t\.groups\.project/, 'Fourth Dimension page must expose project-local navigation')
for (const anchor of ['#matematica', '#explorador', '#galeria-4d', '#cortes-4d', '#laboratorio-4d', '#relatividad', '#arte-4d', '#juego-puzzles', '#museo-4d']) {
  assert.ok(page.includes(`href: '${anchor}'`), `Missing Fourth Dimension navigation anchor ${anchor}`)
}

assert.match(explorer, /TesseractCanvas/, 'Interactive tesseract explorer must remain available')
assert.match(explorer, /HypercubeCalculator/, 'Hypercube calculator must remain available')
assert.match(explorer, /Journey/, 'Dimensional journey must remain available')

for (const component of ['Gallery', 'SliceSimulator', 'EquationLab', 'RelativityLab', 'ArtLab', 'Quest', 'Museum']) {
  assert.match(labs, new RegExp(`function ${component}\\(`), `Missing advanced 4D component ${component}`)
}
for (const figure of ['hypercube', 'hypersphere', 'pentachoron', 'hypertorus', 'hyperpyramid']) {
  assert.match(copy, new RegExp(`${figure}:`), `Missing localized 4D figure ${figure}`)
}
for (const id of ['galeria-4d', 'cortes-4d', 'laboratorio-4d', 'relatividad', 'arte-4d', 'juego-puzzles', 'museo-4d']) {
  assert.ok(labs.includes(`id="${id}"`), `Missing advanced 4D section ${id}`)
}

assert.doesNotMatch(labs, /\beval\s*\(/, '4D laboratory must not evaluate arbitrary code')
assert.doesNotMatch(labs, /dangerouslySetInnerHTML/, '4D laboratory must not inject raw HTML')

console.log('Fourth Dimension project suite smoke passed')
