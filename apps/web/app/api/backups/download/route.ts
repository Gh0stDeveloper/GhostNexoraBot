import { readFile } from 'node:fs/promises'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, verifySession } from '../../../../lib/auth'
import { backupPath, safeBackupFileName } from '../../../../lib/backups'
import { hasPermission } from '../../../../lib/web-security'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const session = verifySession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)
  if (!session || !hasPermission(session.role, 'backups:read')) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const requested = request.nextUrl.searchParams.get('id') ?? ''
  const fileName = safeBackupFileName(requested)
  const filePath = fileName ? backupPath(fileName) : null
  if (!fileName || !filePath) {
    return NextResponse.json({ ok: false, error: 'invalid_backup' }, { status: 400 })
  }

  try {
    const data = await readFile(filePath)
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        'content-type': 'application/gzip',
        'content-disposition': `attachment; filename="${fileName}"`,
        'content-length': String(data.length),
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'backup_not_found' }, { status: 404 })
  }
}
