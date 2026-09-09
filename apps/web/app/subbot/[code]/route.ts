import { NextResponse } from 'next/server'
import { SUBBOT_SESSION_COOKIE, cookieOptions, resolveSubbotPortalToken, signSession } from '../../../lib/auth'
import { publicUrl } from '../../../lib/public-url'

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const session = resolveSubbotPortalToken(code)
  if (!session) return NextResponse.redirect(publicUrl(request, '/login?mode=subbot&error=invalid'), 303)
  const response = NextResponse.redirect(publicUrl(request, '/subbot'), 303)
  response.cookies.set(SUBBOT_SESSION_COOKIE, signSession(session), cookieOptions(session.exp))
  return response
}
