import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { PREAUTH_COOKIE, verifyPreauth } from '../../../../../lib/auth'
import {
  listPasskeys,
  principalHasVerifiedTotp,
  subjectForPrincipal,
} from '../../../../../lib/web-security'

export async function GET() {
  const store = await cookies()
  const preauth = verifyPreauth(store.get(PREAUTH_COOKIE)?.value)
  if (!preauth) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const principal = preauth.role === 'owner'
    ? { role: 'owner' as const }
    : { role: preauth.role, accountId: preauth.accountId }
  const subject = subjectForPrincipal(principal)

  return NextResponse.json({
    ok: true,
    passkey: listPasskeys(subject).length > 0,
    totp: principalHasVerifiedTotp(principal),
  }, { headers: { 'cache-control': 'no-store' } })
}
