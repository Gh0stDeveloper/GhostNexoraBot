import { NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, SUBBOT_SESSION_COOKIE } from '../../../../lib/auth'

function logout(request: Request) {
  const response = NextResponse.redirect(new URL('/login', request.url), 303)
  response.cookies.delete(ADMIN_SESSION_COOKIE)
  response.cookies.delete(SUBBOT_SESSION_COOKIE)
  return response
}

export async function GET(request: Request) { return logout(request) }
export async function POST(request: Request) { return logout(request) }
