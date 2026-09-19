import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import {
  ADMIN_SESSION_COOKIE,
  SUBBOT_SESSION_COOKIE,
  verifySession,
  type WebSession,
} from '../../../lib/auth'
import { auditTarget, recordAdminAudit } from '../../../lib/admin-audit'
import { readOpsSnapshot } from '../../../lib/ops'
import { publicUrl } from '../../../lib/public-url'
import { openBotDbWritable, runtime } from '../../../lib/runtime'
import {
  hasPermission,
  requireMutationSecurity,
  sessionIsFreshForCriticalAction,
  type WebPermission,
} from '../../../lib/web-security'

function controlUrl() {
  const base = new URL(runtime.botHealthUrl)
  base.pathname = '/control'
  base.search = ''
  return base.toString()
}

async function payloadFrom(request: NextRequest) {
  const type = request.headers.get('content-type') ?? ''
  if (type.includes('application/json')) return request.json() as Promise<Record<string, unknown>>
  const form = await request.formData()
  const payload: Record<string, unknown> = {}
  for (const [key, value] of form.entries()) payload[key] = typeof value === 'string' ? value : value.name
  return payload
}

function durationPayload(value: unknown) {
  const raw = String(value ?? '7d').toLowerCase()
  if (['permanent', 'permanente'].includes(raw)) return { duration: 'permanent' }
  const match = /^(\d+)([dh])$/.exec(raw)
  if (!match) return { durationMs: 7 * 86400_000 }
  return { durationMs: Number(match[1]) * (match[2] === 'h' ? 3600_000 : 86400_000) }
}

function normalizeInstance(value: unknown) {
  const raw = String(value ?? 'main').trim().toLowerCase()
  if (!raw || raw === 'main' || raw === 'mainbot') return 'main'
  const match = /^subbot:(\d+)$/.exec(raw)
  if (!match?.[1]) throw new Error('invalid_instance')
  return `subbot:${Number(match[1])}`
}

function normalizeSection(value: unknown, session: WebSession) {
  const owner = session.role === 'owner'
  const privileged = session.role === 'owner' || session.role === 'admin' || session.role === 'support'
  const allowed = session.role === 'subbot'
    ? new Set(['overview', 'platforms', 'providers', 'commands', 'groups', 'logs', 'jobs', 'audit', 'diagnostics', 'account'])
    : owner
      ? new Set(['overview', 'platforms', 'providers', 'commands', 'groups', 'logs', 'jobs', 'audit', 'diagnostics', 'management', 'subbots', 'security'])
      : privileged
        ? new Set(['overview', 'platforms', 'providers', 'commands', 'groups', 'logs', 'jobs', 'audit', 'diagnostics', 'security'])
        : new Set(['overview'])
  const raw = String(value ?? 'overview').trim().toLowerCase()
  return allowed.has(raw) ? raw : 'overview'
}

function responseFor(
  request: NextRequest,
  result: Record<string, unknown>,
  session: WebSession,
  instance?: string,
  section?: string,
) {
  const wantsJson = (request.headers.get('content-type') ?? '').includes('application/json')
  const status = result.ok ? 200 : result.error === 'forbidden' ? 403 : result.error === 'reauth_required' ? 401 : 400
  if (wantsJson) return NextResponse.json(result, { status })

  if (result.error === 'reauth_required') {
    const target = publicUrl(request, '/login')
    target.searchParams.set('error', 'reauth')
    return NextResponse.redirect(target, 303)
  }

  const privileged = session.role !== 'subbot'
  const target = publicUrl(request, privileged ? '/admin' : '/subbot')
  if (privileged && instance) target.searchParams.set('instance', instance)
  if (section) target.searchParams.set('section', normalizeSection(section, session))
  target.searchParams.set(result.ok ? 'ok' : 'error', result.ok ? '1' : String(result.error ?? 'control_failed').slice(0, 100))
  return NextResponse.redirect(target, 303)
}

function auditResult(input: {
  instance: string
  actor: string
  action: string
  payload: Record<string, unknown>
  result: Record<string, unknown>
}) {
  recordAdminAudit({
    instanceKey: input.instance,
    actor: input.actor,
    action: input.action,
    target: auditTarget(input.action, input.payload),
    ok: Boolean(input.result.ok),
    error: input.result.ok ? null : String(input.result.error ?? 'control_failed'),
  })
}

function localOpsAction(action: string, instance: string, payload: Record<string, unknown>, requestedBy: string, role: WebSession['role']) {
  const db = openBotDbWritable()
  if (!db) return { ok: false, error: 'bot_database_unavailable' }
  try {
    const table = (name: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))

    if (action === 'cancel_job' || action === 'retry_job') {
      if (!table('ops_jobs') || !table('ops_job_requests')) return { ok: false, error: 'jobs_runtime_not_ready' }
      const jobId = String(payload.jobId ?? '').trim()
      if (!/^job_[A-Za-z0-9_-]{8,}$/.test(jobId)) return { ok: false, error: 'invalid_job' }
      const job = db.prepare(`SELECT status, cancellable, retryable FROM ops_jobs
        WHERE instance_key = ? AND id = ? LIMIT 1`).get(instance, jobId) as {
          status?: string
          cancellable?: number
          retryable?: number
        } | undefined
      if (!job) return { ok: false, error: 'job_not_found_for_instance' }
      const requestAction = action === 'cancel_job' ? 'cancel' : 'retry'
      if (requestAction === 'cancel' && (!job.cancellable || !['waiting', 'running'].includes(String(job.status)))) {
        return { ok: false, error: 'job_not_cancellable' }
      }
      if (requestAction === 'retry' && (!job.retryable || !['failed', 'cancelled'].includes(String(job.status)))) {
        return { ok: false, error: 'job_not_retryable' }
      }
      const duplicate = db.prepare(`SELECT id FROM ops_job_requests
        WHERE instance_key = ? AND job_id = ? AND action = ? AND status IN ('pending','processing') LIMIT 1`)
        .get(instance, jobId, requestAction)
      if (!duplicate) {
        db.prepare(`INSERT INTO ops_job_requests(instance_key, job_id, action, requested_by, status, requested_at)
          VALUES(?, ?, ?, ?, 'pending', ?)`).run(instance, jobId, requestAction, requestedBy, Date.now())
      }
      return { ok: true, action, instance, jobId, queued: true }
    }

    if (!table('ops_group_control_requests') || !table('ops_groups')) return { ok: false, error: 'ops_runtime_not_ready' }

    if (action === 'reset_audit') {
      if (table('ops_pipeline_metrics')) db.prepare('DELETE FROM ops_pipeline_metrics WHERE instance_key = ?').run(instance)
      if (table('ops_command_metrics')) db.prepare('DELETE FROM ops_command_metrics WHERE instance_key = ?').run(instance)
      return { ok: true, action, instance }
    }

    if (['save_command_config', 'reset_command_config', 'set_command_category'].includes(action)) {
      if (!table('ops_command_catalog')) return { ok: false, error: 'command_catalog_not_ready' }
      db.exec(`
        CREATE TABLE IF NOT EXISTS ops_command_settings (
          instance_key TEXT NOT NULL,
          command_name TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          whatsapp INTEGER NOT NULL DEFAULT 1,
          discord INTEGER NOT NULL DEFAULT 1,
          telegram INTEGER NOT NULL DEFAULT 1,
          cooldown_ms INTEGER NOT NULL DEFAULT 0,
          allow_groups INTEGER NOT NULL DEFAULT 1,
          allow_private INTEGER NOT NULL DEFAULT 1,
          permission_mode TEXT NOT NULL DEFAULT 'inherit',
          updated_at INTEGER NOT NULL,
          PRIMARY KEY(instance_key, command_name)
        );
        CREATE TABLE IF NOT EXISTS ops_command_category_settings (
          instance_key TEXT NOT NULL,
          category TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY(instance_key, category)
        );
        CREATE TABLE IF NOT EXISTS ops_command_cooldowns (
          instance_key TEXT NOT NULL,
          platform TEXT NOT NULL,
          command_name TEXT NOT NULL,
          user_id TEXT NOT NULL,
          last_used_at INTEGER NOT NULL,
          PRIMARY KEY(instance_key, platform, command_name, user_id)
        );
      `)

      const bool = (value: unknown, fallback = false) => {
        if (typeof value === 'boolean') return value
        if (typeof value === 'number') return value !== 0
        const normalized = String(value ?? '').trim().toLowerCase()
        if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
        if (['0', 'false', 'no', 'off'].includes(normalized)) return false
        return fallback
      }

      if (action === 'set_command_category') {
        const category = String(payload.category ?? '').trim().toLowerCase()
        if (!category || !db.prepare('SELECT 1 FROM ops_command_catalog WHERE instance_key = ? AND category = ? LIMIT 1').get(instance, category)) {
          return { ok: false, error: 'invalid_command_category' }
        }
        if (role === 'admin' && category === 'owner') return { ok: false, error: 'forbidden' }
        const enabled = bool(payload.enabled, true)
        db.prepare(`INSERT INTO ops_command_category_settings(instance_key, category, enabled, updated_at)
          VALUES(?, ?, ?, ?)
          ON CONFLICT(instance_key, category) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`)
          .run(instance, category, enabled ? 1 : 0, Date.now())
        return { ok: true, action, instance, category, enabled }
      }

      const commandName = String(payload.commandName ?? '').trim().toLowerCase().replace(/^\.+/, '')
      if (!commandName) return { ok: false, error: 'invalid_command' }
      const catalogColumns = new Set((db.prepare('PRAGMA table_info(ops_command_catalog)').all() as Array<{ name?: string }>).map((column) => String(column.name ?? '')))
      const whatsappColumn = catalogColumns.has('whatsapp') ? 'whatsapp' : '1 AS whatsapp'
      const discordColumn = catalogColumns.has('discord') ? 'discord' : '0 AS discord'
      const telegramColumn = catalogColumns.has('telegram') ? 'telegram' : '0 AS telegram'
      const command = db.prepare(`SELECT category, ${whatsappColumn}, ${discordColumn}, ${telegramColumn}
        FROM ops_command_catalog WHERE instance_key = ? AND command_name = ?`).get(instance, commandName) as {
          category?: string
          whatsapp?: number
          discord?: number
          telegram?: number
        } | undefined
      if (!command) return { ok: false, error: 'command_not_registered_for_instance' }
      if (role === 'admin' && String(command.category) === 'owner') return { ok: false, error: 'forbidden' }

      if (action === 'reset_command_config') {
        db.prepare('DELETE FROM ops_command_settings WHERE instance_key = ? AND command_name = ?').run(instance, commandName)
        db.prepare('DELETE FROM ops_command_cooldowns WHERE instance_key = ? AND command_name = ?').run(instance, commandName)
        return { ok: true, action, instance, commandName }
      }

      const enabled = bool(payload.enabled, true)
      const whatsapp = Boolean(command.whatsapp) && bool(payload.whatsapp, true)
      const discord = Boolean(command.discord) && bool(payload.discord, true)
      const telegram = Boolean(command.telegram) && bool(payload.telegram, true)
      const allowGroups = bool(payload.allowGroups, true)
      const allowPrivate = bool(payload.allowPrivate, true)
      const cooldownMs = Math.min(86_400_000, Math.max(0, Math.trunc(Number(payload.cooldownMs ?? 0) || 0)))
      const permissionModeRaw = String(payload.permissionMode ?? 'inherit').trim().toLowerCase()
      const permissionMode = String(command.category) === 'adult'
        ? 'inherit'
        : ['inherit', 'staff', 'owner'].includes(permissionModeRaw) ? permissionModeRaw : 'inherit'

      db.prepare(`INSERT INTO ops_command_settings(
          instance_key, command_name, enabled, whatsapp, discord, telegram, cooldown_ms,
          allow_groups, allow_private, permission_mode, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(instance_key, command_name) DO UPDATE SET
          enabled = excluded.enabled,
          whatsapp = excluded.whatsapp,
          discord = excluded.discord,
          telegram = excluded.telegram,
          cooldown_ms = excluded.cooldown_ms,
          allow_groups = excluded.allow_groups,
          allow_private = excluded.allow_private,
          permission_mode = excluded.permission_mode,
          updated_at = excluded.updated_at`)
        .run(
          instance,
          commandName,
          enabled ? 1 : 0,
          whatsapp ? 1 : 0,
          discord ? 1 : 0,
          telegram ? 1 : 0,
          cooldownMs,
          allowGroups ? 1 : 0,
          allowPrivate ? 1 : 0,
          permissionMode,
          Date.now(),
        )
      return {
        ok: true,
        action,
        instance,
        commandName,
        config: { enabled, whatsapp, discord, telegram, cooldownMs, allowGroups, allowPrivate, permissionMode },
      }
    }

    if (action === 'sync_groups') {
      const duplicate = db.prepare("SELECT id FROM ops_group_control_requests WHERE instance_key = ? AND action = 'sync' AND status IN ('pending','processing') LIMIT 1").get(instance)
      if (!duplicate) db.prepare(`INSERT INTO ops_group_control_requests(instance_key, action, group_jid, requested_by, status, requested_at)
        VALUES(?, 'sync', NULL, ?, 'pending', ?)`).run(instance, requestedBy, Date.now())
      return { ok: true, action, instance, queued: true }
    }

    const groupActions = new Set([
      'leave_group', 'mute_group_8h', 'mute_group_7d', 'unmute_group',
      'group_announce_on', 'group_announce_off', 'group_lock_on', 'group_lock_off',
      'group_config_update', 'group_broadcast',
    ])
    if (groupActions.has(action)) {
      const groupJid = String(payload.groupJid ?? '')
      if (!groupJid.endsWith('@g.us')) return { ok: false, error: 'invalid_group' }
      const group = db.prepare('SELECT name FROM ops_groups WHERE instance_key = ? AND group_jid = ?').get(instance, groupJid) as { name?: string } | undefined
      if (!group) return { ok: false, error: 'group_not_registered_for_instance' }

      const requestColumns = new Set((db.prepare('PRAGMA table_info(ops_group_control_requests)').all() as Array<{ name?: string }>).map((column) => String(column.name ?? '')))
      if (!requestColumns.has('payload_json')) db.exec('ALTER TABLE ops_group_control_requests ADD COLUMN payload_json TEXT')

      const actionMap: Record<string, string> = {
        leave_group: 'leave',
        mute_group_8h: 'mute:8h',
        mute_group_7d: 'mute:7d',
        unmute_group: 'unmute',
        group_announce_on: 'announce:on',
        group_announce_off: 'announce:off',
        group_lock_on: 'lock:on',
        group_lock_off: 'lock:off',
        group_config_update: 'config',
        group_broadcast: 'broadcast',
      }
      const requestAction = actionMap[action]
      let requestPayload: Record<string, unknown> | null = null

      if (action === 'group_config_update') {
        const bool = (key: string, fallback = false) => {
          const value = payload[key]
          if (typeof value === 'boolean') return value
          if (typeof value === 'number') return value !== 0
          const normalized = String(value ?? '').trim().toLowerCase()
          if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
          if (['0', 'false', 'no', 'off'].includes(normalized)) return false
          return fallback
        }
        const languageRaw = String(payload.language ?? '').trim().toLowerCase()
        const language = languageRaw === 'es' || languageRaw === 'en' ? languageRaw : ''
        requestPayload = {
          botEnabled: bool('botEnabled', false),
          welcome: bool('welcome'),
          goodbye: bool('goodbye'),
          antiLink: bool('antiLink'),
          antiSpam: bool('antiSpam'),
          adultAllowed: bool('adultAllowed'),
          restrictedMode: bool('restrictedMode'),
          language,
          welcomeText: String(payload.welcomeText ?? '').trim().slice(0, 700),
          goodbyeText: String(payload.goodbyeText ?? '').trim().slice(0, 700),
        }
      } else if (action === 'group_broadcast') {
        const message = String(payload.message ?? '').trim()
        if (!message || message.length > 2000) return { ok: false, error: 'invalid_group_broadcast' }
        requestPayload = { message }
      }

      const duplicate = db.prepare("SELECT id FROM ops_group_control_requests WHERE instance_key = ? AND action = ? AND group_jid = ? AND status IN ('pending','processing') LIMIT 1")
        .get(instance, requestAction, groupJid)
      if (!duplicate) db.prepare(`INSERT INTO ops_group_control_requests(instance_key, action, group_jid, requested_by, status, requested_at, payload_json)
        VALUES(?, ?, ?, ?, 'pending', ?, ?)`).run(
          instance,
          requestAction,
          groupJid,
          requestedBy,
          Date.now(),
          requestPayload ? JSON.stringify(requestPayload) : null,
        )
      return { ok: true, action, instance, groupJid, groupName: group.name, queued: true }
    }

    return { ok: false, error: 'unknown_local_action' }
  } catch {
    return { ok: false, error: 'ops_database_write_failed' }
  } finally {
    db.close()
  }
}

async function sendBotControl(outgoing: Record<string, unknown>, action: string) {
  const response = await fetch(controlUrl(), {
    method: 'POST',
    headers: { authorization: `Bearer ${runtime.adminToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(outgoing),
    signal: AbortSignal.timeout(action === 'broadcast' ? 120_000 : 20_000),
  }).catch(() => null)

  if (!response) return { ok: false, error: 'bot_control_unavailable' } as Record<string, unknown>
  const parsed = await response.json().catch(() => null)
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: `bot_control_http_${response.status}` }
  return parsed as Record<string, unknown>
}

function permissionForAction(action: string): WebPermission | null {
  if (action === 'sync_groups') return 'groups:sync'
  if (['mute_group_8h', 'mute_group_7d', 'unmute_group', 'group_announce_on', 'group_announce_off', 'group_lock_on', 'group_lock_off', 'group_config_update', 'group_broadcast'].includes(action)) return 'groups:manage'
  if (action === 'leave_group') return 'groups:leave'
  if (['save_command_config', 'reset_command_config', 'set_command_category'].includes(action)) return 'commands:manage'
  if (action === 'reset_audit') return 'audit:reset'
  if (['cancel_job', 'retry_job'].includes(action)) return 'jobs:manage'
  if (action === 'add_nxc') return 'management:economy'
  if (['grant_subbot', 'reset_subbot'].includes(action)) return 'management:subbots'
  if (action === 'broadcast') return 'management:broadcast'
  if (['create_backup', 'restore_backup'].includes(action)) return 'backups:write'
  return null
}

function requiresFreshAuth(action: string) {
  return new Set([
    'leave_group', 'reset_subbot', 'reset_own_subbot', 'broadcast',
    'create_backup', 'restore_backup', 'add_nxc', 'grant_subbot',
  ]).has(action)
}

async function getSession() {
  const cookieStore = await cookies()
  return verifySession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)
    ?? verifySession(cookieStore.get(SUBBOT_SESSION_COOKIE)?.value)
}

export async function GET() {
  const session = await getSession()
  if (!session || !hasPermission(session.role, 'dashboard:view')) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } })
  }

  const response = await fetch(runtime.botHealthUrl, {
    cache: 'no-store',
    signal: AbortSignal.timeout(4_000),
  }).catch(() => null)
  const health = response
    ? await response.json().catch(() => null) as { connected?: boolean } | null
    : null

  const instance = session.role === 'subbot' ? `subbot:${session.subbotId}` : 'main'
  const persisted = readOpsSnapshot(instance).runtime

  return NextResponse.json({
    ok: true,
    service: 'ghost-nexora-web-control',
    botControlReachable: Boolean(response),
    whatsappConnected: Boolean(health?.connected) || persisted.connected,
    persistedHeartbeatFresh: persisted.fresh,
    registered: persisted.registered,
    groupCount: persisted.groupCount,
  }, { status: 200, headers: { 'cache-control': 'no-store' } })
}

async function handlePost(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const payload = await payloadFrom(request)
  try {
    requireMutationSecurity(request, session, String(payload._csrf ?? ''))
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }

  const action = String(payload.action ?? '')
  const section = normalizeSection(payload.section, session)
  if (session.mfaPending) {
    return responseFor(request, { ok: false, error: 'mfa_enrollment_required' }, session, 'main', 'security')
  }

  let instance = 'main'
  try {
    if (session.role === 'subbot') {
      instance = `subbot:${session.subbotId}`
    } else {
      instance = normalizeInstance(payload.instance)
      if (session.role !== 'owner' && instance !== 'main') {
        return responseFor(request, { ok: false, error: 'forbidden' }, session, 'main', section)
      }
    }
  } catch {
    return responseFor(request, { ok: false, error: 'invalid_instance' }, session, undefined, section)
  }

  if (session.role === 'owner' && instance.startsWith('subbot:')) {
    const db = openBotDbWritable()
    if (!db) return responseFor(request, { ok: false, error: 'bot_database_unavailable' }, session, instance, section)
    const id = Number(instance.split(':')[1])
    let exists = false
    try { exists = Boolean(db.prepare('SELECT 1 FROM subbots WHERE id = ?').get(id)) } finally { db.close() }
    if (!exists) return responseFor(request, { ok: false, error: 'subbot_not_found' }, session, 'main', section)
  }

  if (action === 'reset_own_subbot') {
    if (session.role !== 'subbot') return responseFor(request, { ok: false, error: 'forbidden' }, session, instance, section)
  } else {
    const required = permissionForAction(action)
    if (!required || !hasPermission(session.role, required)) {
      return responseFor(request, { ok: false, error: 'forbidden' }, session, instance, section)
    }
  }

  if (requiresFreshAuth(action) && !sessionIsFreshForCriticalAction(session.authAt)) {
    return responseFor(request, { ok: false, error: 'reauth_required' }, session, instance, section)
  }

  const actor = session.role === 'subbot'
    ? `subbot-owner:${session.subbotId}`
    : session.role === 'owner'
      ? 'web-owner'
      : `web-${session.role}:${session.accountId}`

  const localActions = new Set([
    'leave_group', 'sync_groups', 'reset_audit', 'save_command_config', 'reset_command_config', 'set_command_category', 'mute_group_8h', 'mute_group_7d', 'unmute_group',
    'group_announce_on', 'group_announce_off', 'group_lock_on', 'group_lock_off',
    'group_config_update', 'group_broadcast', 'cancel_job', 'retry_job',
  ])

  if (localActions.has(action)) {
    const requestedBy = session.role === 'subbot' ? session.userJid : actor
    const result = localOpsAction(action, instance, payload, requestedBy, session.role)
    auditResult({ instance, actor, action, payload, result })
    return responseFor(request, result, session, instance, section)
  }

  const { _csrf: _ignoredCsrf, ...outgoing } = payload
  if (action === 'grant_subbot') Object.assign(outgoing, durationPayload(payload.duration))
  if (session.role === 'subbot') {
    outgoing.id = session.subbotId
    outgoing.userJid = session.userJid
  }

  const result = await sendBotControl(outgoing, action)
  auditResult({ instance, actor, action, payload: outgoing, result })
  return responseFor(request, result, session, instance, section)
}

export async function POST(request: NextRequest) {
  try {
    return await handlePost(request)
  } catch {
    return NextResponse.json({ ok: false, error: 'control_internal_error' }, { status: 500 })
  }
}
