import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, SUBBOT_SESSION_COOKIE, verifySession } from '../../../lib/auth'
import { runtime } from '../../../lib/runtime'

function controlUrl() {
  const base = new URL(runtime.botHealthUrl)
  base.pathname = '/control'; base.search = ''
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

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const admin = verifySession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)
  const subbot = verifySession(cookieStore.get(SUBBOT_SESSION_COOKIE)?.value)
  const payload = await payloadFrom(request)
  const action = String(payload.action ?? '')
  const isAdmin = admin?.role === 'admin'
  const isSubbot = subbot?.role === 'subbot'
  if (!isAdmin && !isSubbot) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const outgoing: Record<string, unknown> = { ...payload }
  if (action === 'grant_subbot') Object.assign(outgoing, durationPayload(payload.duration))
  if (isSubbot) {
    if (action !== 'reset_own_subbot') return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    outgoing.id = subbot.subbotId
    outgoing.userJid = subbot.userJid
  }

  const response = await fetch(controlUrl(), {
    method: 'POST',
    headers: { authorization: `Bearer ${runtime.adminToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(outgoing),
    signal: AbortSignal.timeout(action === 'broadcast' ? 120_000 : 20_000),
  }).catch(() => null)

  const result = response ? await response.json().catch(() => ({ ok: false, error: 'invalid_control_response' })) as Record<string, unknown> : { ok: false, error: 'bot_control_unavailable' }
  const wantsJson = (request.headers.get('content-type') ?? '').includes('application/json')
  if (wantsJson) return NextResponse.json(result, { status: response?.ok ? 200 : 400 })
  const target = isAdmin ? '/admin' : '/subbot'
  const redirect = new URL(target, request.url)
  redirect.searchParams.set(result.ok ? 'ok' : 'error', result.ok ? '1' : String(result.error ?? 'control_failed').slice(0, 100))
  return NextResponse.redirect(redirect, 303)
}
