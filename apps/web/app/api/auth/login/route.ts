import { NextResponse } from 'next/server'
import {
  ADMIN_SESSION_COOKIE,
  SUBBOT_SESSION_COOKIE,
  cookieOptions,
  createAdminSession,
  resolveSubbotPortalToken,
  signSession,
  verifyAdminToken,
} from '../../../../lib/auth'
import { publicUrl } from '../../../../lib/public-url'

function loginUrl(request: Request, mode: string, error: string) {
  const url = publicUrl(request, '/login')
  url.searchParams.set('mode', mode)
  url.searchParams.set('error', error)
  return url
}

export async function POST(request: Request) {
  const form = await request.formData()
  const mode = String(form.get('mode') ?? '')
  const token = String(form.get('token') ?? '').trim()

  if (mode === 'admin') {
    if (!verifyAdminToken(token)) return NextResponse.redirect(loginUrl(request, 'admin', 'invalid'), 303)
    const session = createAdminSession()
    const response = NextResponse.redirect(publicUrl(request, '/admin'), 303)
    response.cookies.set(ADMIN_SESSION_COOKIE, signSession(session), cookieOptions(session.exp))
    response.cookies.delete(SUBBOT_SESSION_COOKIE)
    return response
  }

  if (mode === 'subbot') {
    const session = resolveSubbotPortalToken(token)
    if (!session) return NextResponse.redirect(loginUrl(request, 'subbot', 'invalid'), 303)
    const response = NextResponse.redirect(publicUrl(request, '/subbot'), 303)
    response.cookies.set(SUBBOT_SESSION_COOKIE, signSession(session), cookieOptions(session.exp))
    response.cookies.delete(ADMIN_SESSION_COOKIE)
    return response
  }

  return NextResponse.redirect(loginUrl(request, 'admin', 'mode'), 303)
}
