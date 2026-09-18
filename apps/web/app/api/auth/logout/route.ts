import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, SUBBOT_SESSION_COOKIE, verifySession } from '../../../../lib/auth'
import { publicUrl } from '../../../../lib/public-url'
import { requireMutationSecurity, revokeSession } from '../../../../lib/web-security'

export async function POST(request: Request) {
  const store = await cookies()
  const session = verifySession(store.get(ADMIN_SESSION_COOKIE)?.value)
    ?? verifySession(store.get(SUBBOT_SESSION_COOKIE)?.value)

  if (session) {
    try {
      const form = await request.formData()
      requireMutationSecurity(request, session, String(form.get('_csrf') ?? ''))
      revokeSession(session.sid)
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
    }
  }

  const response = NextResponse.redirect(publicUrl(request, '/login'), 303)
  response.cookies.delete(ADMIN_SESSION_COOKIE)
  response.cookies.delete(SUBBOT_SESSION_COOKIE)
  return response
}

export async function GET() {
  return NextResponse.json({ ok: false, error: 'method_not_allowed' }, { status: 405 })
}
