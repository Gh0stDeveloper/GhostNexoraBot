import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import {
  ADMIN_SESSION_COOKIE,
  SUBBOT_SESSION_COOKIE,
  verifySession,
  type WebSession,
} from '../../../lib/auth'
import { auditTarget, recordAdminAudit } from '../../../lib/admin-audit'
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
    ? new Set(['overview', 'groups', 'audit', 'account'])
    : owner
      ? new Set(['overview', 'groups', 'audit', 'management', 'subbots', 'security'])
      : privileged
        ? new Set(['overview', 'groups', 'audit', 'security'])
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

function localOpsAction(action: string, instance: string, payload: Record<string, unknown>, requestedBy: string) {
  const db = openBotDbWritable()
  if (!db) return { ok: false, error: 'bot_database_unavailable' }
  try {
    const table = (name: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
    if (!table('ops_group_control_requests') || !table('ops_groups')) return { ok: false, error: 'ops_runtime_not_ready' }

    if (action === 'reset_audit') {
      if (table('ops_pipeline_metrics')) db.prepare('DELETE FROM ops_pipeline_metrics WHERE instance_key = ?').run(instance)
      if (table('ops_command_metrics')) db.prepare('DELETE FROM ops_command_metrics WHERE instance_key = ?').run(instance)
      return { ok: true, action, instance }
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
    ])
    if (groupActions.has(action)) {
      const groupJid = String(payload.groupJid ?? '')
      if (!groupJid.endsWith('@g.us')) return { ok: false, error: 'invalid_group' }
      const group = db.prepare('SELECT name FROM ops_groups WHERE instance_key = ? AND group_jid = ?').get(instance, groupJid) as { name?: string } | undefined
      if (!group) return { ok: false, error: 'group_not_registered_for_instance' }

      const actionMap: Record<string, string> = {
        leave_group: 'leave',
        mute_group_8h: 'mute:8h',
        mute_group_7d: 'mute:7d',
        unmute_group: 'unmute',
        group_announce_on: 'announce:on',
        group_announce_off: 'announce:off',
        group_lock_on: 'lock:on',
        group_lock_off: 'lock:off',
      }
      const requestAction = actionMap[action]
      const duplicate = db.prepare("SELECT id FROM ops_group_control_requests WHERE instance_key = ? AND action = ? AND group_jid = ? AND status IN ('pending','processing') LIMIT 1")
        .get(instance, requestAction, groupJid)
      if (!duplicate) db.prepare(`INSERT INTO ops_group_control_requests(instance_key, action, group_jid, requested_by, status, requested_at)
        VALUES(?, ?, ?, ?, 'pending', ?)`).run(instance, requestAction, groupJid, requestedBy, Date.now())
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
  if (['mute_group_8h', 'mute_group_7d', 'unmute_group', 'group_announce_on', 'group_announce_off', 'group_lock_on', 'group_lock_off'].includes(action)) return 'groups:manage'
  if (action === 'leave_group') return 'groups:leave'
  if (action === 'reset_audit') return 'audit:reset'
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
  return NextResponse.json({ ok: true, service: 'ghost-nexora-web-control' }, { headers: { 'cache-control': 'no-store' } })
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
    'leave_group', 'sync_groups', 'reset_audit', 'mute_group_8h', 'mute_group_7d', 'unmute_group',
    'group_announce_on', 'group_announce_off', 'group_lock_on', 'group_lock_off',
  ])

  if (localActions.has(action)) {
    const requestedBy = session.role === 'subbot' ? session.userJid : actor
    const result = localOpsAction(action, instance, payload, requestedBy)
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
