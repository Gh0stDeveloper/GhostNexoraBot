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

const spanishHints = /(?:\b(?:el|la|los|las|un|una|para|por|con|sin|que|tu|tus|este|esta|grupo|usuario|bot|comando|comandos|mensaje|error|disponible|selecciona|descargar|buscar|página|siguiente|anterior|perfil|tienda|saldo|juego|partida|ganaste|perdiste|bienvenido|advertencia|expulsado|activado|desactivado|uso|solo|necesitas|puedes|ahora|estado|actualizado|configurado|idioma|waifu|variante)\b|[áéíóúñ¿¡])/i

function shouldSkip(file) {
  return excluded.some((part) => file.includes(part)) || file.endsWith('.d.ts')
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
    node.templateSpans.forEach((span, index) => {
      text += `{expr${index}}${span.literal.text}`
    })
    return text
  }
  return null
}

function collectLiterals(node, out, sf, file, kind, context, seen = new Set()) {
  if (!node || seen.has(node)) return
  seen.add(node)
  const value = literalValue(node)
  if (value !== null && value.trim()) {
    out.push({
      file: path.relative(process.cwd(), file).replaceAll('\\', '/'),
      line: lineOf(sf, node),
      kind,
      text: value,
      spanishHint: spanishHints.test(value),
      context,
    })
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
      else if (name === 'buttons' || name === 'cards' || name === 'sections' || name === 'rows' || name === 'submessages' || name === 'view_model') {
        collectLiterals(prop.initializer, out, sf, file, kind, context, seen)
      }
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

  if (ts.isCallExpression(node) && node.expression.getText(sf).endsWith('.join')) {
    collectLiterals(node.expression.expression, out, sf, file, kind, context, seen)
  }
}

function isLocalized(node, sf) {
  let cur = node
  for (let i = 0; i < 8 && cur; i += 1, cur = cur.parent) {
    if (ts.isCallExpression(cur)) {
      const callee = cur.expression.getText(sf)
      if (callee === 'ctx.t' || callee.endsWith('.t') || callee === 'translate' || callee === 'translateForChat' || callee === 'localizeLegacyText') return true
    }
  }
  return false
}

function auditFile(file, source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const findings = []

  function visit(node) {
    if (isLocalized(node, sf)) {
      ts.forEachChild(node, visit)
      return
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf)
      if (userFacingCalls.some((pattern) => pattern.test(callee))) {
        node.arguments.forEach((arg) => collectLiterals(arg, findings, sf, file, `call:${callee}`, expressionText(node, sf)))
      }
    }

    if (ts.isThrowStatement(node) && node.expression && ts.isNewExpression(node.expression)) {
      const ctor = node.expression.expression.getText(sf)
      if (ctor === 'Error' && node.expression.arguments?.length) {
        collectLiterals(node.expression.arguments[0], findings, sf, file, 'throw:Error', expressionText(node, sf))
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(sf).replace(/^['"]|['"]$/g, '')
      const commandsPath = file.includes(`${path.sep}commands${path.sep}`)
      if (commandsPath && (name === 'description' || name === 'usage')) {
        collectLiterals(node.initializer, findings, sf, file, `command:${name}`, expressionText(node.parent, sf))
      }
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /(?:HTML|MESSAGE|TEXT|CAPTION|TITLE|BODY)$/i.test(node.name.text) && node.initializer) {
      collectLiterals(node.initializer, findings, sf, file, `constant:${node.name.text}`, expressionText(node, sf))
    }

    ts.forEachChild(node, visit)
  }
  visit(sf)
  return findings
}

const files = await walk(ROOT)
const all = []
for (const file of files) {
  const source = await fs.readFile(file, 'utf8')
  all.push(...auditFile(file, source))
}

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
  scannedFiles: files.length,
  findings: unique.length,
  spanishHints: unique.filter((item) => item.spanishHint).length,
  byFile,
  entries: unique,
}

await fs.writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`[i18n-audit] scanned=${report.scannedFiles} findings=${report.findings} spanishHints=${report.spanishHints}`)
for (const row of byFile.slice(0, 120)) console.log(`[i18n-audit] ${row.count.toString().padStart(3)} · es=${row.spanishHints.toString().padStart(3)} · ${row.file}`)

if (CHECK && unique.length) {
  console.error(`[i18n-audit] FAIL: ${unique.length} user-facing literals remain outside locale catalogs.`)
  process.exit(1)
}
