import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  ADMIN_SESSION_COOKIE,
  SUBBOT_SESSION_COOKIE,
  sessionCsrfToken,
  sessionPrincipal,
  verifySession,
} from '../../../lib/auth'
import {
  createStaffAccount,
  deletePasskey,
  hasPermission,
  listPasskeys,
  listPrivilegedSessionsForOwner,
  listSessionsForPrincipal,
  listStaffAccounts,
  requireMutationSecurity,
  revokeOtherSessions,
  revokeSession,
  revokeStaffAccount,
  sessionBelongsToPrincipal,
  subjectForPrincipal,
} from '../../../lib/web-security'

async function currentSession() {
  const store = await cookies()
  return verifySession(store.get(ADMIN_SESSION_COOKIE)?.value) ?? verifySession(store.get(SUBBOT_SESSION_COOKIE)?.value)
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
}

export async function GET() {
  const session = await currentSession()
  if (!session) return unauthorized()
  const principal = sessionPrincipal(session)
  const subject = subjectForPrincipal(principal)
  const sessions = session.role === 'owner'
    ? listPrivilegedSessionsForOwner()
    : listSessionsForPrincipal(principal)

  return NextResponse.json({
    ok: true,
    role: session.role,
    csrfToken: sessionCsrfToken(session),
    staff: session.role === 'owner' ? listStaffAccounts() : [],
    sessions,
    passkeys: listPasskeys(subject),
  }, { headers: { 'cache-control': 'no-store' } })
}

export async function POST(request: Request) {
  const session = await currentSession()
  if (!session) return unauthorized()

  let body: Record<string, unknown>
  try {
    body = await request.json() as Record<string, unknown>
    requireMutationSecurity(request, session, request.headers.get('x-csrf-token'))
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }

  const principal = sessionPrincipal(session)
  const action = String(body.action ?? '')

  if (action === 'create_staff') {
    if (!hasPermission(session.role, 'security:manage') || session.role !== 'owner') {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    const role = body.role === 'support' ? 'support' : body.role === 'admin' ? 'admin' : null
    if (!role) return NextResponse.json({ ok: false, error: 'invalid_role' }, { status: 400 })
    try {
      const created = createStaffAccount(String(body.label ?? ''), role)
      return NextResponse.json({ ok: true, account: { id: created.id, label: created.label, role: created.role, createdAt: created.createdAt }, token: created.token })
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_staff' }, { status: 400 })
    }
  }

  if (action === 'revoke_staff') {
    if (!hasPermission(session.role, 'security:manage') || session.role !== 'owner') {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    const id = String(body.id ?? '')
    return NextResponse.json({ ok: revokeStaffAccount(id) })
  }

  if (action === 'revoke_session') {
    if (!hasPermission(session.role, 'sessions:manage')) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    const id = String(body.id ?? '')
    if (!id || !sessionBelongsToPrincipal(id, principal)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    return NextResponse.json({ ok: revokeSession(id), revokedCurrent: id === session.sid })
  }

  if (action === 'revoke_other_sessions') {
    if (!hasPermission(session.role, 'sessions:manage')) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    const count = revokeOtherSessions(session.sid, principal)
    return NextResponse.json({ ok: true, count })
  }

  if (action === 'delete_passkey') {
    if (!hasPermission(session.role, 'sessions:manage')) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    const credentialId = String(body.credentialId ?? '')
    const subject = subjectForPrincipal(principal)
    return NextResponse.json({ ok: deletePasskey(subject, credentialId) })
  }

  return NextResponse.json({ ok: false, error: 'unknown_action' }, { status: 400 })
}
