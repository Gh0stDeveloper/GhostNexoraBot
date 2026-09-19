#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const root = process.cwd()
const temp = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-e10-logs-'))
const dataDir = path.join(temp, 'data')
const controlDb = path.join(temp, 'control.sqlite')
mkdirSync(dataDir, { recursive: true })

const legacy = new DatabaseSync(controlDb)
legacy.exec(`
  CREATE TABLE ops_runtime_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_key TEXT NOT NULL,
    level TEXT NOT NULL,
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  INSERT INTO ops_runtime_logs(instance_key, level, source, message, created_at)
  VALUES('main', 'info', 'legacy', 'legacy event', 1);
`)
legacy.close()

Object.assign(process.env, {
  ENV_FILE: path.join(temp, 'missing.env'),
  DATA_DIR: dataDir,
  SESSION_DIR: path.join(dataDir, 'session'),
  NEXORA_GLOBAL_CONTROL_DB: controlDb,
  NEXORA_GLOBAL_ECONOMY_DB: path.join(temp, 'economy.sqlite'),
  NEXORA_INSTANCE_ROLE: 'main',
  ADMIN_WEB_TOKEN: 'admin-secret-value-123456',
  TELEGRAM_BOT_TOKEN: 'telegram-secret-value-123456',
  DISCORD_BOT_TOKEN: 'discord-secret-value-123456',
  LEMPI_API_KEY: 'lempi-secret-value-123456',
  OPENROUTER_API_KEY: 'openrouter-secret-value-123456',
  OWNER_NUMBERS: '',
  OLLAMA_ENABLED: 'false',
  WEB_ENABLED: 'false',
})

try {
  const { recordOpsRuntimeLog, sanitizeOpsLogText } = await import('../apps/bot/dist/services/ops-runtime-log.js')
  const { opsDb } = await import('../apps/bot/dist/services/ops-database.js')

  const columns = opsDb.prepare('PRAGMA table_info(ops_runtime_logs)').all().map((row) => String(row.name))
  assert.ok(columns.includes('category'), 'E10 must migrate legacy ops_runtime_logs with category')

  const raw = [
    'Bearer abcdefghijklmnopqrstuvwxyz123456',
    'password=my-password-value',
    'cookie=session-cookie-value',
    'sid=session-id-value',
    'api_key=query-secret-value',
    'lempi-secret-value-123456',
    'eyJabcdefghijklmno.abcdefghijklmnop.abcdefghijklmnop',
  ].join(' ')
  const clean = sanitizeOpsLogText(raw)
  for (const leaked of [
    'abcdefghijklmnopqrstuvwxyz123456',
    'my-password-value',
    'session-cookie-value',
    'session-id-value',
    'query-secret-value',
    'lempi-secret-value-123456',
    'eyJabcdefghijklmno.abcdefghijklmnop.abcdefghijklmnop',
  ]) {
    assert.ok(!clean.includes(leaked), `secret leaked from sanitizer: ${leaked}`)
  }
  assert.match(clean, /REDACTED/, 'sanitizer must visibly redact sensitive values')

  assert.equal(recordOpsRuntimeLog('error', 'api.lempi', 'provider_failed token=lempi-secret-value-123456'), true)
  assert.equal(recordOpsRuntimeLog('info', 'whatsapp', 'WhatsApp transport connected'), true)
  assert.equal(recordOpsRuntimeLog('debug', 'command.menu', 'command_ok · duration=12ms', 'main', 'command'), true)

  const rows = opsDb.prepare(`SELECT level, source, category, message
    FROM ops_runtime_logs WHERE created_at > 1 ORDER BY id ASC`).all()
  assert.equal(rows.length, 3)
  assert.equal(rows[0].category, 'api')
  assert.equal(rows[1].category, 'whatsapp')
  assert.equal(rows[2].category, 'command')
  assert.ok(!String(rows[0].message).includes('lempi-secret-value-123456'), 'persisted log leaked configured API key')

  const runtimeLog = readFileSync(path.join(root, 'apps/bot/src/services/ops-runtime-log.ts'), 'utf8')
  const performance = readFileSync(path.join(root, 'apps/bot/src/services/performance-audit.ts'), 'utf8')
  const providers = readFileSync(path.join(root, 'apps/bot/src/services/provider-health.ts'), 'utf8')
  const observability = readFileSync(path.join(root, 'apps/web/lib/ops-observability.ts'), 'utf8')
  const apiRoute = readFileSync(path.join(root, 'apps/web/app/api/ops/logs/route.ts'), 'utf8')
  const dashboard = readFileSync(path.join(root, 'apps/web/components/realtime-logs-dashboard.tsx'), 'utf8')
  const admin = readFileSync(path.join(root, 'apps/web/app/admin/page.tsx'), 'utf8')
  const subbot = readFileSync(path.join(root, 'apps/web/app/subbot/page.tsx'), 'utf8')
  const security = readFileSync(path.join(root, 'apps/web/lib/web-security.ts'), 'utf8')
  const navigation = readFileSync(path.join(root, 'apps/web/components/unified-navigation.tsx'), 'utf8')
  const i18n = readFileSync(path.join(root, 'apps/web/lib/ops-extra-i18n.ts'), 'utf8')
  const roadmap = readFileSync(path.join(root, 'README_NEXT_INTEGRATIONS.md'), 'utf8')

  assert.match(runtimeLog, /RETENTION_MS = 3 \* 86_400_000/, 'E10 72h retention missing')
  assert.match(runtimeLog, /MAX_ROWS_PER_INSTANCE = 1_000/, 'E10 per-instance row cap missing')
  assert.match(runtimeLog, /CREATE INDEX IF NOT EXISTS idx_ops_runtime_logs_instance_category_created/, 'E10 category index missing')
  assert.match(runtimeLog, /Bearer\|Basic/, 'E10 authorization redaction missing')
  assert.match(runtimeLog, /REDACTED_JWT/, 'E10 JWT redaction missing')

  assert.match(performance, /recordCommandLog\(/, 'E10 command telemetry hook missing')
  assert.match(performance, /commandLogCategory/, 'E10 download command classification missing')
  assert.match(providers, /recordOpsRuntimeLog\(/, 'E10 provider log hook missing')
  assert.match(providers, /provider_failed/, 'E10 provider failures must be visible')

  assert.match(observability, /WebOpsLogChannel = 'all' \| 'whatsapp' \| 'discord' \| 'telegram' \| 'errors' \| 'downloads' \| 'api' \| 'commands'/, 'E10 channel catalog missing')
  assert.match(observability, /id > \?/, 'E10 incremental log query missing')
  assert.match(observability, /safeLogText/, 'E10 web defense-in-depth sanitizer missing')

  assert.match(apiRoute, /ADMIN_SESSION_COOKIE/, 'E10 privileged session auth missing')
  assert.match(apiRoute, /SUBBOT_SESSION_COOKIE/, 'E10 subbot session auth missing')
  assert.match(apiRoute, /hasPermission\(current\.role, 'logs:view'\)/, 'E10 logs permission check missing')
  assert.match(apiRoute, /ownerInstanceExists/, 'E10 owner subbot validation missing')
  assert.match(apiRoute, /cache-control': 'no-store/, 'E10 API must not cache logs')

  assert.match(dashboard, /3_000/, 'E10 3-second polling missing')
  assert.match(dashboard, /document\.visibilityState === 'visible'/, 'E10 hidden-tab polling pause missing')
  assert.match(dashboard, /id: 'whatsapp'/, 'E10 WhatsApp filter missing')
  assert.match(dashboard, /id: 'discord'/, 'E10 Discord filter missing')
  assert.match(dashboard, /id: 'telegram'/, 'E10 Telegram filter missing')
  assert.match(dashboard, /id: 'errors'/, 'E10 error filter missing')
  assert.match(dashboard, /id: 'downloads'/, 'E10 download filter missing')
  assert.match(dashboard, /id: 'api'/, 'E10 API filter missing')
  assert.match(dashboard, /id: 'commands'/, 'E10 command filter missing')

  assert.match(admin, /section === 'logs'/, 'E10 admin section missing')
  assert.match(admin, /hasPermission\(role, 'logs:view'\)/, 'E10 admin permission enforcement missing')
  assert.match(subbot, /section === 'logs'/, 'E10 subbot section missing')
  assert.match(subbot, /instanceKey=\{instanceKey\}/, 'E10 subbot logs must use own instance')
  assert.match(security, /'logs:view'/, 'E10 permission missing')
  assert.match(navigation, /\| 'logs'/, 'E10 unified navigation icon missing')
  assert.match(i18n, /'realtimeLogs\.title'/, 'E10 bilingual UI copy missing')
  assert.match(roadmap, /## E10\. Logs en tiempo real[\s\S]*Estado: (?:EN PROGRESO|TERMINADO)/, 'E10 roadmap status missing')

  console.log('Phase E10 real-time logs smoke passed')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
