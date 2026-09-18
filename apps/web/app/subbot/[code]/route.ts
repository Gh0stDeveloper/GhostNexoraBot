import { NextResponse } from 'next/server'
import {
  ADMIN_SESSION_COOKIE,
  PREAUTH_COOKIE,
  SUBBOT_SESSION_COOKIE,
  cookieOptions,
  createSubbotSession,
  resolveSubbotPortalToken,
  signSession,
} from '../../../lib/auth'
import { publicUrl } from '../../../lib/public-url'

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const access = resolveSubbotPortalToken(code)
  if (!access) return NextResponse.redirect(publicUrl(request, '/login?error=invalid'), 303)

  const session = createSubbotSession(access, request)
  const response = NextResponse.redirect(publicUrl(request, '/subbot'), 303)
  response.cookies.set(SUBBOT_SESSION_COOKIE, signSession(session), cookieOptions(session.exp))
  response.cookies.delete(ADMIN_SESSION_COOKIE)
  response.cookies.delete(PREAUTH_COOKIE)
  return response
}
