import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, verifySession } from '../../../lib/auth'
import { recordAdminAudit } from '../../../lib/admin-audit'
import { publicUrl } from '../../../lib/public-url'
import { runMainPlatformAction, type WebPlatformAction, type WebPlatformId } from '../../../lib/platform-status'
import {
  hasPermission,
  requireMutationSecurity,
  sessionIsFreshForCriticalAction,
} from '../../../lib/web-security'

function safePlatform(value: unknown): WebPlatformId | null {
  return value === 'whatsapp' || value === 'discord' || value === 'telegram' ? value : null
}

function safeAction(value: unknown): WebPlatformAction | null {
  return value === 'connect' || value === 'disconnect' || value === 'restart' ? value : null
}

function actor(session: NonNullable<ReturnType<typeof verifySession>>) {
  if (session.role === 'owner') return 'web-owner'
  if (session.role === 'admin' || session.role === 'support') return `web-${session.role}:${session.accountId}`
  return 'web-subbot'
}

export async function POST(request: Request) {
  const store = await cookies()
  const session = verifySession(store.get(ADMIN_SESSION_COOKIE)?.value)
  if (!session || session.role === 'subbot') {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })

  try {
    requireMutationSecurity(request, session, String(form.get('_csrf') ?? ''))
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }

  const platform = safePlatform(form.get('platform'))
  const action = safeAction(form.get('action'))
  if (!platform || !action) {
    return NextResponse.json({ ok: false, error: 'invalid_action' }, { status: 400 })
  }

  const required = action === 'disconnect' ? 'platforms:disable' : 'platforms:operate'
  if (!hasPermission(session.role, required)) {
    recordAdminAudit({
      instanceKey: 'main',
      actor: actor(session),
      action: `platform_${action}`,
      target: platform,
      ok: false,
      error: 'forbidden',
    })
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  if (action === 'disconnect' && !sessionIsFreshForCriticalAction(session.authAt)) {
    const target = publicUrl(request, '/login')
    target.searchParams.set('error', 'reauth')
    return NextResponse.redirect(target, 303)
  }

  const result = await runMainPlatformAction(platform, action)
  recordAdminAudit({
    instanceKey: 'main',
    actor: actor(session),
    action: `platform_${action}`,
    target: platform,
    ok: result.ok,
    error: result.ok ? null : result.error,
  })

  const target = publicUrl(request, '/admin')
  target.searchParams.set('section', 'platforms')
  target.searchParams.set('focus', platform)
  target.searchParams.set(result.ok ? 'ok' : 'error', result.ok ? '1' : result.error)
  return NextResponse.redirect(target, 303)
}
