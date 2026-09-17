import { config } from '../config.js'
import { opsDb, opsInstanceKey } from './ops-database.js'

export type OpsLogLevel = 'debug' | 'info' | 'warn' | 'error'

opsDb.exec(`
  CREATE TABLE IF NOT EXISTS ops_runtime_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_key TEXT NOT NULL,
    level TEXT NOT NULL,
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ops_runtime_logs_instance_created
    ON ops_runtime_logs(instance_key, created_at DESC);
`)

function redact(value: unknown) {
  let text = String(value ?? '').replace(/\s+/g, ' ').trim()
  for (const secret of [
    config.adminWebToken,
    config.telegramBotToken,
    process.env.DISCORD_BOT_TOKEN,
    process.env.LEMPI_API_KEY,
    process.env.X_BEARER_TOKEN,
    process.env.VK_ACCESS_TOKEN,
  ]) {
    if (secret && secret.length >= 6) text = text.split(secret).join('[REDACTED]')
  }
  text = text
    .replace(/\bBearer\s+[A-Za-z0-9._~-]{12,}\b/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:key|token|apikey|api_key|access_token|auth)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, '[REDACTED]')
  return text.slice(0, 700) || 'runtime_event'
}

function safeSource(value: unknown) {
  return String(value ?? 'runtime').toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').slice(0, 64) || 'runtime'
}

export function recordOpsRuntimeLog(level: OpsLogLevel, source: string, message: unknown, instanceKey = opsInstanceKey()) {
  const stamp = Date.now()
  try {
    opsDb.prepare(`INSERT INTO ops_runtime_logs(instance_key, level, source, message, created_at)
      VALUES(?, ?, ?, ?, ?)`)
      .run(instanceKey, level, safeSource(source), redact(message), stamp)

    if (Math.random() < 0.04) {
      opsDb.prepare('DELETE FROM ops_runtime_logs WHERE created_at < ?').run(stamp - 7 * 86_400_000)
      opsDb.prepare(`DELETE FROM ops_runtime_logs WHERE instance_key = ? AND id NOT IN (
        SELECT id FROM ops_runtime_logs WHERE instance_key = ? ORDER BY created_at DESC LIMIT 500
      )`).run(instanceKey, instanceKey)
    }
    return true
  } catch {
    return false
  }
}
