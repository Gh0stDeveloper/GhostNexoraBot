import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, SUBBOT_SESSION_COOKIE, verifySession } from '../../../../lib/auth'
import { readOpsRuntimeLogs, type WebOpsLogChannel, type WebOpsLogLevel } from '../../../../lib/ops-observability'
import { openBotDb } from '../../../../lib/runtime'
import { hasPermission } from '../../../../lib/web-security'

function channel(value: string | null): WebOpsLogChannel {
  return value === 'whatsapp' || value === 'discord' || value === 'telegram' || value === 'errors'
    || value === 'downloads' || value === 'api' || value === 'commands'
    ? value
    : 'all'
}

function level(value: string | null): 'all' | WebOpsLogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error' ? value : 'all'
}

async function session() {
  const store = await cookies()
  return verifySession(store.get(ADMIN_SESSION_COOKIE)?.value)
    ?? verifySession(store.get(SUBBOT_SESSION_COOKIE)?.value)
}

function ownerInstanceExists(instanceKey: string) {
  if (instanceKey === 'main') return true
  const match = /^subbot:(\d+)$/.exec(instanceKey)
  if (!match?.[1]) return false
  const db = openBotDb()
  if (!db) return false
  try {
    return Boolean(db.prepare('SELECT 1 FROM subbots WHERE id = ? LIMIT 1').get(Number(match[1])))
  } finally {
    db.close()
  }
}

export async function GET(request: NextRequest) {
  const current = await session()
  if (!current || !hasPermission(current.role, 'logs:view')) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, {
      status: 401,
      headers: { 'cache-control': 'no-store' },
    })
  }

  const requested = String(request.nextUrl.searchParams.get('instance') ?? 'main').trim().toLowerCase()
  let instanceKey = 'main'

  if (current.role === 'subbot') {
    instanceKey = `subbot:${current.subbotId}`
  } else if (current.role === 'owner') {
    const normalized = requested === 'main' || requested === 'mainbot'
      ? 'main'
      : /^subbot:\d+$/.test(requested)
        ? `subbot:${Number(requested.split(':')[1])}`
        : ''
    if (!normalized || !ownerInstanceExists(normalized)) {
      return NextResponse.json({ ok: false, error: 'invalid_instance' }, {
        status: 400,
        headers: { 'cache-control': 'no-store' },
      })
    }
    instanceKey = normalized
  }

  const afterId = Math.max(0, Math.trunc(Number(request.nextUrl.searchParams.get('afterId') ?? 0) || 0))
  const limit = Math.max(1, Math.min(200, Math.trunc(Number(request.nextUrl.searchParams.get('limit') ?? 120) || 120)))
  const query = String(request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 120)

  const rows = readOpsRuntimeLogs(instanceKey, limit, {
    channel: channel(request.nextUrl.searchParams.get('channel')),
    level: level(request.nextUrl.searchParams.get('level')),
    query,
    afterId,
  })

  return NextResponse.json({
    ok: true,
    instanceKey,
    rows,
    latestId: rows.reduce((max, row) => Math.max(max, row.id), afterId),
    generatedAt: Date.now(),
  }, {
    status: 200,
    headers: {
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
    },
  })
}
