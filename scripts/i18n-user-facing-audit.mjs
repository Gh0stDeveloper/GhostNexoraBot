import { promises as fs } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOT = path.resolve('apps/bot/src')
const OUTPUT = path.resolve('i18n-user-facing-audit.json')
const CHECK = process.argv.includes('--check')

const excluded = [
  `${path.sep}i18n${path.sep}locales${path.sep}`,
  `${path.sep}i18n${path.sep}types.ts`,
]

// Los juegos quedan fuera del alcance multilenguaje por decisión del proyecto.
// Se excluyen los módulos dedicados a minijuegos/PvP/casino/RPG y sus servicios
// de presentación; los archivos mixtos se filtran además por category: 'games'.
const gameOnlyFiles = new Set([
  'apps/bot/src/commands/games.ts',
  'apps/bot/src/commands/games-pvp.ts',
  'apps/bot/src/commands/dino.ts',
  'apps/bot/src/commands/snake.ts',
  'apps/bot/src/commands/doom.ts',
  'apps/bot/src/commands/ninja.ts',
  'apps/bot/src/commands/spacedodge.ts',
  'apps/bot/src/commands/gato.ts',
  'apps/bot/src/commands/damas.ts',
  'apps/bot/src/commands/casino-guard-v4.ts',
  'apps/bot/src/commands/rpg.ts',
  'apps/bot/src/services/games.ts',
  'apps/bot/src/services/games-pvp.ts',
  'apps/bot/src/services/dino-game.ts',
  'apps/bot/src/services/snake-game.ts',
  'apps/bot/src/services/doom-game.ts',
  'apps/bot/src/services/ninja-game.ts',
  'apps/bot/src/services/space-dodge-game.ts',
  'apps/bot/src/services/gato-game.ts',
  'apps/bot/src/services/damas-game.ts',
  'apps/bot/src/services/mario-game.ts',
  'apps/bot/src/services/rpg.ts',
  'apps/bot/src/services/ai-html.ts',
])

const userFacingProperties = new Set([
  'text', 'caption', 'title', 'body', 'footer', 'description', 'displayText', 'display_text',
  'buttonText', 'header', 'placeholder', 'messageText', 'selectedDisplayText', 'contentText',
])

const userFacingCalls = [
  /(?:^|\.)reply$/,
  /(?:^|\.)sendMessage$/,
  /(?:^|\.)sendInteractiveCard$/,
  /(?:^|\.)sendCarousel$/,
  /(?:^|\.)sendList$/,
  /(?:^|\.)sendButtonCard$/,
  /(?:^|\.)sendQuickReplyCard$/,
  /(?:^|\.)generateWAMessageFromContent$/,
]

const spanishHints = /(?:\b(?:el|la|los|las|un|una|para|por|con|sin|que|tu|tus|este|esta|grupo|usuario|bot|comando|comandos|mensaje|error|disponible|selecciona|descargar|buscar|página|siguiente|anterior|perfil|tienda|saldo|bienvenido|advertencia|expulsado|activado|desactivado|uso|solo|necesitas|puedes|ahora|estado|actualizado|configurado|idioma|waifu|variante)\b|[áéíóúñ¿¡])/i

function relative(file) {
  return path.relative(process.cwd(), file).replaceAll('\\', '/')
}

function shouldSkip(file) {
  const rel = relative(file)
  return excluded.some((part) => file.includes(part)) || gameOnlyFiles.has(rel) || file.endsWith('.d.ts')
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walk(full))
    else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name) && !shouldSkip(full)) files.push(full)
  }
  return files
}

function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
}

function expressionText(node, sf) {
  return node.getText(sf).replace(/\s+/g, ' ').slice(0, 180)
}

function literalValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text
    node.templateSpans.forEach((span, index) => { text += `{expr${index}}${span.literal.text}` })
    return text
  }
  return null
}

function objectCategory(object, sf) {
  if (!ts.isObjectLiteralExpression(object)) return ''
  for (const prop of object.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const name = prop.name.getText(sf).replace(/^['"]|['"]$/g, '')
    if (name !== 'category') continue
    if (ts.isStringLiteralLike(prop.initializer)) return prop.initializer.text.toLowerCase()
  }
  return ''
}

function insideExcludedGameCommand(node, sf) {
  let current = node
  for (let depth = 0; current && depth < 16; depth += 1, current = current.parent) {
    if (ts.isObjectLiteralExpression(current) && objectCategory(current, sf) === 'games') return true
  }
  return false
}

function collectLiterals(node, out, sf, file, kind, context, seen = new Set()) {
  if (!node || seen.has(node) || insideExcludedGameCommand(node, sf)) return
  seen.add(node)
  const value = literalValue(node)
  if (value !== null && value.trim()) {
    out.push({ file: relative(file), line: lineOf(sf, node), kind, text: value, spanishHint: spanishHints.test(value), context })
    return
  }
  if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((child) => collectLiterals(child, out, sf, file, kind, context, seen))
    return
  }
  if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const name = prop.name.getText(sf).replace(/^['"]|['"]$/g, '')
      if (userFacingProperties.has(name)) collectLiterals(prop.initializer, out, sf, file, `${kind}.${name}`, context, seen)
      else if (['buttons', 'cards', 'sections', 'rows', 'submessages', 'view_model'].includes(name)) collectLiterals(prop.initializer, out, sf, file, kind, context, seen)
    }
    return
  }
  if (ts.isConditionalExpression(node)) {
    collectLiterals(node.whenTrue, out, sf, file, kind, context, seen)
    collectLiterals(node.whenFalse, out, sf, file, kind, context, seen)
    return
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    collectLiterals(node.left, out, sf, file, kind, context, seen)
    collectLiterals(node.right, out, sf, file, kind, context, seen)
    return
  }
  if (ts.isCallExpression(node) && node.expression.getText(sf).endsWith('.join')) collectLiterals(node.expression.expression, out, sf, file, kind, context, seen)
}

function isLocalized(node, sf) {
  let current = node
  for (let i = 0; i < 8 && current; i += 1, current = current.parent) {
    if (!ts.isCallExpression(current)) continue
    const callee = current.expression.getText(sf)
    if (callee === 'ctx.t' || callee.endsWith('.t') || callee === 'translate' || callee === 'translateForChat') return true
  }
  return false
}

function auditFile(file, source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const findings = []

  function visit(node) {
    if (insideExcludedGameCommand(node, sf)) return
    if (isLocalized(node, sf)) {
      ts.forEachChild(node, visit)
      return
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf)
      if (userFacingCalls.some((pattern) => pattern.test(callee))) node.arguments.forEach((arg) => collectLiterals(arg, findings, sf, file, `call:${callee}`, expressionText(node, sf)))
    }
    // Errores internos no cuentan por sí solos como UI. El router debe convertirlos
    // a mensajes públicos localizados antes de enviarlos al usuario.
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(sf).replace(/^['"]|['"]$/g, '')
      const commandsPath = file.includes(`${path.sep}commands${path.sep}`)
      if (commandsPath && (name === 'description' || name === 'usage')) collectLiterals(node.initializer, findings, sf, file, `command:${name}`, expressionText(node.parent, sf))
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /(?:MESSAGE|TEXT|CAPTION|TITLE|BODY)$/i.test(node.name.text) && node.initializer) {
      collectLiterals(node.initializer, findings, sf, file, `constant:${node.name.text}`, expressionText(node, sf))
    }
    ts.forEachChild(node, visit)
  }

  visit(sf)
  return findings
}

const files = await walk(ROOT)
const all = []
for (const file of files) all.push(...auditFile(file, await fs.readFile(file, 'utf8')))

const unique = []
const seen = new Set()
for (const finding of all) {
  const key = `${finding.file}:${finding.line}:${finding.kind}:${finding.text}`
  if (seen.has(key)) continue
  seen.add(key)
  unique.push(finding)
}
unique.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

const byFile = Object.entries(Object.groupBy(unique, (item) => item.file))
  .map(([file, items]) => ({ file, count: items?.length ?? 0, spanishHints: items?.filter((item) => item.spanishHint).length ?? 0 }))
  .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))

const report = {
  generatedAt: new Date().toISOString(),
  scope: {
    locales: ['es', 'en'],
    games: 'excluded',
    gamesReason: 'Game/minigame/PvP/casino/RPG UI is intentionally outside the multilingual migration scope.',
  },
  scannedFiles: files.length,
  findings: unique.length,
  spanishHints: unique.filter((item) => item.spanishHint).length,
  byFile,
  entries: unique,
}

await fs.writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`[i18n-audit] scope=non-games scanned=${report.scannedFiles} findings=${report.findings} spanishHints=${report.spanishHints}`)
for (const row of byFile.slice(0, 120)) console.log(`[i18n-audit] ${row.count.toString().padStart(3)} · es=${row.spanishHints.toString().padStart(3)} · ${row.file}`)

if (CHECK && unique.length) {
  console.error(`[i18n-audit] FAIL: ${unique.length} non-game user-facing literals remain outside locale catalogs.`)
  process.exit(1)
}
