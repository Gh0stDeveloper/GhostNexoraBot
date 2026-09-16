#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const sourceRoot = path.join(root, 'apps/bot/src')
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))
const outputPath = path.resolve(outputArg ? outputArg.slice('--output='.length) : 'artifacts/v2-phase2-ui-audit.json')

const allowedMessageGenerators = new Set([
  'apps/bot/src/platform/whatsapp/interactive.ts',
  'apps/bot/src/platform/whatsapp/rich-response.ts',
  'apps/bot/src/services/rich-code-message.ts',
  'apps/bot/src/services/premium-stickers-v18.ts',
])

const allowedRawRelays = new Set([
  'apps/bot/src/platform/whatsapp/interactive.ts',
  'apps/bot/src/platform/whatsapp/rich-response.ts',
  'apps/bot/src/services/rich-code-message.ts',
  'apps/bot/src/services/premium-stickers-v18.ts',
  'apps/bot/src/services/security-poc-scope.ts',
  'apps/bot/src/commands/edit.ts',
  'apps/bot/src/commands/valley-poc-v22.ts',
  'apps/bot/src/commands/valley-compat-v21.ts',
])

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walk(absolute))
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(absolute)
  }
  return files
}

function count(source, regex) {
  return [...source.matchAll(regex)].length
}

const files = await walk(sourceRoot)
const rows = []
const violations = []

for (const absolute of files) {
  const file = path.relative(root, absolute).replaceAll(path.sep, '/')
  const source = await readFile(absolute, 'utf8')
  const metrics = {
    normalizedUi: count(source, /ctx\.adapter\.sendUi\s*\(/g),
    legacyCards: count(source, /sendInteractiveCard\s*\(/g),
    legacyCarousels: count(source, /sendCarousel\s*\(/g),
    htmlRich: count(source, /sendAiHtmlMessage\s*\(/g),
    codeRich: count(source, /sendRichAiCodeMessage\s*\(/g),
    richPreview: count(source, /sendRichLinkPreview\s*\(/g),
    rawGenerator: count(source, /generateWAMessageFromContent\s*\(/g),
    rawRelay: count(source, /\.relayMessage\s*\(/g),
  }
  const total = Object.values(metrics).reduce((sum, value) => sum + value, 0)
  if (total > 0) rows.push({ file, ...metrics })

  if (/\b(?:carouselMessage|CarouselMessage)\b/.test(source)) {
    violations.push({ file, rule: 'native-carousel-forbidden', detail: 'Stable V2 source must not emit carouselMessage/CarouselMessage.' })
  }
  if (/\b(?:buttonsMessage|templateMessage|listMessage)\b/.test(source)) {
    violations.push({ file, rule: 'legacy-interactive-envelope', detail: 'Legacy buttons/template/list payload detected.' })
  }
  if (/generateWAMessageFromContent\s*\(/.test(source) && !allowedMessageGenerators.has(file)) {
    violations.push({ file, rule: 'raw-message-generator-boundary', detail: 'Raw WhatsApp message generation is outside the reviewed transport allowlist.' })
  }
  if (/\.relayMessage\s*\(/.test(source) && !allowedRawRelays.has(file)) {
    violations.push({ file, rule: 'raw-relay-boundary', detail: 'Raw relayMessage is outside the reviewed transport/PoC allowlist.' })
  }
}

const totals = rows.reduce((acc, row) => {
  for (const key of ['normalizedUi', 'legacyCards', 'legacyCarousels', 'htmlRich', 'codeRich', 'richPreview', 'rawGenerator', 'rawRelay']) {
    acc[key] = (acc[key] ?? 0) + row[key]
  }
  return acc
}, {})

const report = {
  schemaVersion: 1,
  kind: 'ghost-nexora-v2-phase2-ui-compat-audit',
  generatedAt: new Date().toISOString(),
  generatedFromSha: process.env.GITHUB_SHA || null,
  stablePolicy: {
    nativeCarousel: false,
    commandCarousel: 'single_select',
    urlCarousel: 'actionable_text',
    htmlTransport: 'shared_view_compatible_rich_response',
  },
  allowedMessageGenerators: [...allowedMessageGenerators].sort(),
  allowedRawRelays: [...allowedRawRelays].sort(),
  totals,
  routes: rows.sort((a, b) => a.file.localeCompare(b.file)),
  violations,
}

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(`[V2 UI AUDIT] routes=${rows.length}`)
console.log(`[V2 UI AUDIT] normalizedUi=${totals.normalizedUi ?? 0} legacyCards=${totals.legacyCards ?? 0} legacyCarousels=${totals.legacyCarousels ?? 0}`)
console.log(`[V2 UI AUDIT] rawGenerator=${totals.rawGenerator ?? 0} rawRelay=${totals.rawRelay ?? 0}`)
console.log(`[V2 UI AUDIT] violations=${violations.length}`)
console.log(`[V2 UI AUDIT] report=${path.relative(root, outputPath)}`)

if (violations.length) {
  for (const violation of violations) console.error(`[V2 UI AUDIT] ${violation.rule}: ${violation.file} — ${violation.detail}`)
  process.exitCode = 1
}
