import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, SUBBOT_SESSION_COOKIE, verifySession } from '../../../lib/auth'
import { publicUrl } from '../../../lib/public-url'
import { openBotDbWritable, runtime } from '../../../lib/runtime'

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

function responseFor(request: NextRequest, result: Record<string, unknown>, isAdmin: boolean, instance?: string) {
  const wantsJson = (request.headers.get('content-type') ?? '').includes('application/json')
  if (wantsJson) return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  const target = isAdmin ? '/admin' : '/subbot'
  const redirect = publicUrl(request, target)
  if (isAdmin && instance) redirect.searchParams.set('instance', instance)
  redirect.searchParams.set(result.ok ? 'ok' : 'error', result.ok ? '1' : String(result.error ?? 'control_failed').slice(0, 100))
  return NextResponse.redirect(redirect, 303)
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

    if (action === 'leave_group') {
      const groupJid = String(payload.groupJid ?? '')
      if (!groupJid.endsWith('@g.us')) return { ok: false, error: 'invalid_group' }
      const group = db.prepare('SELECT name FROM ops_groups WHERE instance_key = ? AND group_jid = ?').get(instance, groupJid) as { name?: string } | undefined
      if (!group) return { ok: false, error: 'group_not_registered_for_instance' }
      const duplicate = db.prepare("SELECT id FROM ops_group_control_requests WHERE instance_key = ? AND action = 'leave' AND group_jid = ? AND status IN ('pending','processing') LIMIT 1").get(instance, groupJid)
      if (!duplicate) db.prepare(`INSERT INTO ops_group_control_requests(instance_key, action, group_jid, requested_by, status, requested_at)
        VALUES(?, 'leave', ?, ?, 'pending', ?)`).run(instance, groupJid, requestedBy, Date.now())
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

/** Safe browser diagnostic. It intentionally exposes no admin token or JIDs. */
export async function GET() {
  const response = await fetch(runtime.botHealthUrl, {
    cache: 'no-store',
    signal: AbortSignal.timeout(4_000),
  }).catch(() => null)
  const health = response ? await response.json().catch(() => null) as { connected?: boolean } | null : null
  return NextResponse.json({
    ok: true,
    service: 'ghost-nexora-web-control',
    botControlReachable: Boolean(response),
    whatsappConnected: Boolean(health?.connected),
  }, { status: 200, headers: { 'cache-control': 'no-store' } })
}

async function handlePost(request: NextRequest) {
  const cookieStore = await cookies()
  const admin = verifySession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)
  const subbot = verifySession(cookieStore.get(SUBBOT_SESSION_COOKIE)?.value)
  const payload = await payloadFrom(request)
  const action = String(payload.action ?? '')
  const isAdmin = admin?.role === 'admin'
  const isSubbot = subbot?.role === 'subbot'
  if (!isAdmin && !isSubbot) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  let instance = 'main'
  try {
    instance = isSubbot ? `subbot:${subbot.subbotId}` : normalizeInstance(payload.instance)
  } catch {
    return responseFor(request, { ok: false, error: 'invalid_instance' }, Boolean(isAdmin))
  }

  if (isAdmin && instance.startsWith('subbot:')) {
    const db = openBotDbWritable()
    if (!db) return responseFor(request, { ok: false, error: 'bot_database_unavailable' }, true, instance)
    const id = Number(instance.split(':')[1])
    let exists = false
    try { exists = Boolean(db.prepare('SELECT 1 FROM subbots WHERE id = ?').get(id)) } finally { db.close() }
    if (!exists) return responseFor(request, { ok: false, error: 'subbot_not_found' }, true, 'main')
  }

  if (['leave_group', 'sync_groups', 'reset_audit'].includes(action)) {
    const requestedBy = isSubbot ? subbot.userJid : 'web-admin'
    return responseFor(request, localOpsAction(action, instance, payload, requestedBy), Boolean(isAdmin), instance)
  }

  const outgoing: Record<string, unknown> = { ...payload }
  if (action === 'grant_subbot') Object.assign(outgoing, durationPayload(payload.duration))
  if (isSubbot) {
    if (action !== 'reset_own_subbot') return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    outgoing.id = subbot.subbotId
    outgoing.userJid = subbot.userJid
  }

  const result = await sendBotControl(outgoing, action)
  return responseFor(request, result, Boolean(isAdmin), instance)
}

export async function POST(request: NextRequest) {
  try {
    return await handlePost(request)
  } catch {
    const wantsJson = (request.headers.get('content-type') ?? '').includes('application/json')
    if (wantsJson) return NextResponse.json({ ok: false, error: 'control_internal_error' }, { status: 500 })
    return responseFor(request, { ok: false, error: 'control_internal_error' }, true, 'main')
  }
}
