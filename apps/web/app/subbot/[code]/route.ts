import { NextResponse } from 'next/server'
import { SUBBOT_SESSION_COOKIE, cookieOptions, resolveSubbotPortalToken, signSession } from '../../../lib/auth'

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const session = resolveSubbotPortalToken(code)
  if (!session) return NextResponse.redirect(new URL('/login?mode=subbot&error=invalid', request.url), 303)
  const response = NextResponse.redirect(new URL('/subbot', request.url), 303)
  response.cookies.set(SUBBOT_SESSION_COOKIE, signSession(session), cookieOptions(session.exp))
  return response
}
