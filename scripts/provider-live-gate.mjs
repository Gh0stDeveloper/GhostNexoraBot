#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execa } from 'execa'

const allowKnownAntiBotBlocks = process.argv.includes('--allow-known-antibot-blocks')
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))
const gateOutputArg = process.argv.find((arg) => arg.startsWith('--gate-output='))
const outputPath = path.resolve(outputArg ? outputArg.slice('--output='.length) : 'artifacts/v2-phase3-live-provider-audit.json')
const gateOutputPath = path.resolve(gateOutputArg ? gateOutputArg.slice('--gate-output='.length) : 'artifacts/v2-phase3-live-provider-gate.json')

const audit = await execa(process.execPath, [
  path.resolve('scripts/v2-phase3-live-provider-audit.mjs'),
  `--output=${outputPath}`,
], {
  reject: false,
  stdout: 'inherit',
  stderr: 'inherit',
})

let report
try {
  report = JSON.parse(await readFile(outputPath, 'utf8'))
} catch (error) {
  throw new Error(`El live audit no produjo un reporte JSON válido: ${error instanceof Error ? error.message : String(error)}`)
}

const failures = Object.entries(report.required ?? {})
  .filter(([, value]) => !value?.ok)
  .map(([name, value]) => ({ name, error: String(value?.error ?? 'required check failed') }))

function isKnownExternalAntiBotBlock(item) {
  if (!/^(?:apkmirror|apkpure)-/.test(item.name)) return false
  return /HTTP\s+403\b.*protecci[oó]n anti-bot activa/i.test(item.error)
}

const acceptedExternalBlocks = failures.filter(isKnownExternalAntiBotBlock)
const structuralFailures = failures.filter((item) => !isKnownExternalAntiBotBlock(item))
const status = structuralFailures.length
  ? 'failed'
  : acceptedExternalBlocks.length
    ? (allowKnownAntiBotBlocks ? 'pass_with_external_blocks' : 'failed_strict')
    : 'passed'

const gateReport = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  auditExitCode: audit.exitCode,
  allowKnownAntiBotBlocks,
  status,
  acceptedExternalBlocks,
  structuralFailures,
}

await mkdir(path.dirname(gateOutputPath), { recursive: true })
await writeFile(gateOutputPath, `${JSON.stringify(gateReport, null, 2)}\n`, 'utf8')
console.log(`[phase3-live-gate] report=${path.relative(process.cwd(), gateOutputPath)}`)

if (structuralFailures.length) {
  throw new Error(`[V2 PHASE 3 LIVE GATE] ${structuralFailures.length} fallo(s) estructural(es): ${structuralFailures.map((item) => `${item.name}: ${item.error}`).join(' | ')}`)
}

if (acceptedExternalBlocks.length && !allowKnownAntiBotBlocks) {
  throw new Error(`[V2 PHASE 3 LIVE GATE] ${acceptedExternalBlocks.length} bloqueo(s) anti-bot externo(s). Repite con --allow-known-antibot-blocks solo en runners hospedados que ya tengan smokes deterministas verdes.`)
}

if (audit.exitCode !== 0 && failures.length === 0) {
  throw new Error(`[V2 PHASE 3 LIVE GATE] El proceso de audit terminó con código ${audit.exitCode} sin registrar un required failure.`)
}

if (acceptedExternalBlocks.length) {
  console.log(`[V2 PHASE 3 LIVE GATE] PASS WITH EXTERNAL BLOCKS — ${acceptedExternalBlocks.map((item) => item.name).join(', ')} fueron bloqueados explícitamente por protección anti-bot HTTP 403; no hubo fallos estructurales.`)
} else {
  console.log('[V2 PHASE 3 LIVE GATE] PASS — todos los checks live requeridos completaron sin fallos.')
}
