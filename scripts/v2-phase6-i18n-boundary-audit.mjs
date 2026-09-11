import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOT = process.cwd()
const read = (file) => fs.readFile(path.join(ROOT, file), 'utf8')
const checks = []
function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail })
  assert.ok(condition, `${name}${detail ? `: ${detail}` : ''}`)
}

const [router, adapter, localizedSocket, interactive, language, telegram, discord, discordTypes, webServer, webProvider, webCatalog] = await Promise.all([
  read('apps/bot/src/core/router.ts'),
  read('apps/bot/src/platform/whatsapp/adapter.ts'),
  read('apps/bot/src/platform/whatsapp/localized-socket.ts'),
  read('apps/bot/src/platform/whatsapp/interactive.ts'),
  read('apps/bot/src/commands/language.ts'),
  read('apps/bot/src/platform/telegram/router.ts'),
  read('apps/bot/src/platform/discord/router.ts'),
  read('apps/bot/src/platform/discord/types.ts'),
  read('apps/web/lib/i18n-server.ts'),
  read('apps/web/components/i18n-provider.tsx'),
  read('apps/web/lib/i18n.ts'),
])

check('WhatsApp router sender+instance locale', /resolveChatLocale\(chatId,\s*sender,\s*botInstanceId\)/.test(router))
check('WhatsApp router contextual localized socket', /createLocalizedSocket\(socket,\s*locale,\s*\{\s*contextChatId:\s*chatId,\s*botInstanceId\s*\}\)/s.test(router))
check('WhatsApp adapter retains active sender', /private activeUserId\?: string/.test(adapter) && /this\.activeUserId = normalized\.senderId/.test(adapter))
check('WhatsApp adapter resolves sender+instance locale', /resolveChatLocale\(chatId,\s*this\.activeUserId,\s*this\.botInstanceId\)/.test(adapter))
check('WhatsApp interactive receives localized proxy', /sendInteractiveCard\(localizedSocket/.test(adapter) && /sendCarousel\(localizedSocket/.test(adapter))
check('WhatsApp localized socket exposes context', /LOCALIZED_SOCKET_CONTEXT/.test(localizedSocket) && /contextChatId/.test(localizedSocket) && /botInstanceId/.test(localizedSocket))
check('WhatsApp interactive inherits socket context', /localizedSocketContext/.test(interactive) && /interactiveLocale\(socket, chatId\)/.test(interactive))
check('WhatsApp language command uses namespaced preferences', /setPlatformLocale/.test(language) && /clearPlatformLocale/.test(language) && /platformLocalePreference/.test(language))

check('Telegram uses platform locale resolver', /resolvePlatformLocale/.test(telegram))
check('Telegram consumes language_code', /language_code/.test(telegram))
check('Telegram exposes language command', /['"]language['"]/.test(telegram) && /setPlatformLocale/.test(telegram))
check('Discord uses platform locale resolver', /resolvePlatformLocale/.test(discord))
check('Discord consumes interaction locale', /clientLocale/.test(discord) && /interaction\.locale/.test(discord))
check('Discord supports guild_locale', /guild_locale/.test(discordTypes))
check('Discord application commands localize descriptions', /description_localizations/.test(discord) && /en-US/.test(discord))
check('Discord exposes language command', /['"]language['"]/.test(discord) && /setPlatformLocale/.test(discord))

check('Web detects Accept-Language', /accept-language/i.test(webServer))
check('Web persists locale cookie', /gnb_locale/.test(webServer) && /gnb_locale/.test(webProvider))
check('Web provider refreshes server components', /router\.refresh\(\)/.test(webProvider))

function objectKeys(source, variableName) {
  const sf = ts.createSourceFile('i18n.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let keys = []
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === variableName && node.initializer) {
      let initializer = node.initializer
      if (ts.isSatisfiesExpression(initializer) || ts.isAsExpression(initializer)) initializer = initializer.expression
      if (ts.isObjectLiteralExpression(initializer)) {
        keys = initializer.properties
          .filter(ts.isPropertyAssignment)
          .map((prop) => ts.isStringLiteralLike(prop.name) ? prop.name.text : prop.name.getText(sf).replace(/^['"]|['"]$/g, ''))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return keys.sort()
}

const webEsKeys = objectKeys(webCatalog, 'es')
const webEnKeys = objectKeys(webCatalog, 'en')
check('Web ES catalog exists', webEsKeys.length >= 200, `keys=${webEsKeys.length}`)
check('Web ES/EN catalog parity', JSON.stringify(webEsKeys) === JSON.stringify(webEnKeys), `es=${webEsKeys.length} en=${webEnKeys.length}`)

// Hints deliberately exclude language-neutral technical tokens such as "error".
// Paths/URLs are also excluded before language classification because query keys
// are protocol/navigation data, not user-facing copy.
const spanishHints = /(?:\b(?:el|la|los|las|una|para|por|con|sin|grupo|grupos|usuario|usuarios|comando|comandos|mensaje|mensajes|disponible|selecciona|descargar|buscar|página|perfil|tienda|saldo|bienvenido|advertencia|expulsado|activado|desactivado|uso|solo|necesitas|puedes|ahora|estado|actualizado|configurado|idioma|cerrar|abrir|volver|sesión|vincular|administración|auditoría|gestión|número|tráfico|vencimiento|resumen|cuenta)\b|[áéíóúñ¿¡])/i
const webRoots = ['apps/web/app', 'apps/web/components']
const webSkipParts = [
  `${path.sep}api${path.sep}`,
  `${path.sep}proxy${path.sep}`,
]

async function walk(dir) {
  const entries = await fs.readdir(path.join(ROOT, dir), { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walk(rel))
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) files.push(rel)
  }
  return files
}

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) return node.text
  if (ts.isTemplateExpression(node)) return `${node.head.text}${node.templateSpans.map((span) => span.literal.text).join('')}`
  return null
}

function isExemptLiteral(node, sf) {
  const text = literalText(node) ?? ''
  const trimmed = text.trim()
  if (!trimmed) return true
  if (/^(?:https?:|\/|#)/i.test(trimmed)) return true
  if (/^Error:?$/i.test(trimmed)) return true
  if (/^(?:\.|[a-z0-9_-]+(?:\s+[a-z0-9_:[\]()./'"=;-]+)*)$/i.test(trimmed) && !spanishHints.test(trimmed)) return true
  let current = node.parent
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parent) {
    if (ts.isCallExpression(current)) {
      const callee = current.expression.getText(sf)
      if (callee === 'webT' || callee === 't') return true
    }
    if (ts.isImportDeclaration(current) || ts.isExportDeclaration(current)) return true
  }
  return false
}

const webLiteralFindings = []
for (const root of webRoots) {
  for (const file of await walk(root)) {
    if (webSkipParts.some((part) => file.includes(part))) continue
    const source = await read(file)
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (node) => {
      const value = literalText(node)
      if (value !== null && spanishHints.test(value) && !isExemptLiteral(node, sf)) {
        const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf))
        webLiteralFindings.push({ file: file.replaceAll('\\', '/'), line: pos.line + 1, text: value.trim().replace(/\s+/g, ' ').slice(0, 180) })
        return
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
}
check('Web migrated surfaces have no Spanish UI literals outside catalog', webLiteralFindings.length === 0, JSON.stringify(webLiteralFindings.slice(0, 20)))

let legacyDebt = null
try {
  const raw = JSON.parse(await fs.readFile(path.join(ROOT, 'i18n-user-facing-audit.json'), 'utf8'))
  legacyDebt = {
    scannedFiles: Number(raw.scannedFiles ?? 0),
    findings: Number(raw.findings ?? 0),
    spanishHints: Number(raw.spanishHints ?? 0),
    scope: raw.scope ?? null,
  }
} catch {
  legacyDebt = { unavailable: true }
}

const report = {
  generatedAt: new Date().toISOString(),
  gate: 'phase6-i18n-boundary',
  botCatalog: 'validated by runtime smoke/assertCatalogParity',
  webCatalog: { esKeys: webEsKeys.length, enKeys: webEnKeys.length },
  webLiteralFindings,
  legacyLiteralDebt: legacyDebt,
  note: 'Legacy WhatsApp inline literals remain measured separately. The blocking Phase 6 gate requires every supported user-facing dispatch boundary to be locale-aware and prevents new untranslated Web UI literals.',
  checks,
}
await fs.writeFile(path.join(ROOT, 'v2-phase6-i18n-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`[v2-phase6-audit] OK · checks=${checks.length} · webKeys=${webEsKeys.length} · webLiteralFindings=0 · legacyDebt=${legacyDebt?.findings ?? 'n/a'}`)
