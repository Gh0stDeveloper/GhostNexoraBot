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

function loginUrl(request: Request, error: string) {
  const url = publicUrl(request, '/login')
  url.searchParams.set('error', error)
  return url
}

export async function POST(request: Request) {
  const form = await request.formData()
  const token = String(form.get('token') ?? '').trim()

  if (!token) return NextResponse.redirect(loginUrl(request, 'invalid'), 303)

  if (verifyAdminToken(token)) {
    const session = createAdminSession()
    const response = NextResponse.redirect(publicUrl(request, '/admin'), 303)
    response.cookies.set(ADMIN_SESSION_COOKIE, signSession(session), cookieOptions(session.exp))
    response.cookies.delete(SUBBOT_SESSION_COOKIE)
    return response
  }

  const subbotSession = resolveSubbotPortalToken(token)
  if (subbotSession) {
    const response = NextResponse.redirect(publicUrl(request, '/subbot'), 303)
    response.cookies.set(SUBBOT_SESSION_COOKIE, signSession(subbotSession), cookieOptions(subbotSession.exp))
    response.cookies.delete(ADMIN_SESSION_COOKIE)
    return response
  }

  return NextResponse.redirect(loginUrl(request, 'invalid'), 303)
}
