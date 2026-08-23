import type http from 'node:http'
import { currentSeason, groupStats, progressionProfile } from './progression-v4.js'
import { clanTop, marketListings, worldSummary } from './world-v4.js'
import { automationSummary, listTickets } from './automation-v4.js'

function json(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(payload))
}

function userJid(value: string) {
  const decoded = decodeURIComponent(value).trim()
  if (decoded.includes('@')) return decoded
  const digits = decoded.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) throw new Error('jid inválido')
  return `${digits}@s.whatsapp.net`
}

export async function handleV4Api(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!req.url?.startsWith('/api/v1/')) return false
  if (req.method !== 'GET') { json(res, 405, { ok: false, error: 'method_not_allowed' }); return true }
  const url = new URL(req.url, 'http://127.0.0.1')
  try {
    if (url.pathname === '/api/v1/status') {
      json(res, 200, { ok: true, version: 'v1', world: worldSummary(), automation: automationSummary(), season: currentSeason(3) })
      return true
    }
    if (url.pathname === '/api/v1/seasons/current') {
      json(res, 200, { ok: true, season: currentSeason(Math.min(50, Number(url.searchParams.get('limit') ?? 10))) })
      return true
    }
    if (url.pathname === '/api/v1/clans') {
      json(res, 200, { ok: true, clans: clanTop(Math.min(50, Number(url.searchParams.get('limit') ?? 20))) })
      return true
    }
    if (url.pathname === '/api/v1/market') {
      json(res, 200, { ok: true, listings: marketListings(Math.min(50, Number(url.searchParams.get('limit') ?? 20))) })
      return true
    }
    if (url.pathname === '/api/v1/tickets') {
      const status = url.searchParams.get('status') ?? 'open'
      json(res, 200, { ok: true, tickets: listTickets(undefined, status, Math.min(100, Number(url.searchParams.get('limit') ?? 30))) })
      return true
    }
    const groupMatch = url.pathname.match(/^\/api\/v1\/groups\/([^/]+)\/stats$/)
    if (groupMatch?.[1]) {
      json(res, 200, { ok: true, stats: groupStats(decodeURIComponent(groupMatch[1])) })
      return true
    }
    const userMatch = url.pathname.match(/^\/api\/v1\/users\/([^/]+)\/profile$/)
    if (userMatch?.[1]) {
      json(res, 200, { ok: true, profile: progressionProfile(userJid(userMatch[1])) })
      return true
    }
    json(res, 404, { ok: false, error: 'api_route_not_found' })
  } catch (error) {
    json(res, 400, { ok: false, error: error instanceof Error ? error.message : 'bad_request' })
  }
  return true
}
