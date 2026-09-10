#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-v2-phase3-http-'))
process.env.DATA_DIR = temp
process.env.SESSION_DIR = path.join(temp, 'session')
process.env.OLLAMA_ENABLED = 'false'
process.env.WEB_ENABLED = 'false'

const server = createServer((request, response) => {
  if (request.url === '/start') {
    response.statusCode = 302
    response.setHeader('location', '/middle')
    response.setHeader('set-cookie', 'hop_one=1; Path=/; HttpOnly; SameSite=Lax')
    response.end()
    return
  }
  if (request.url === '/middle') {
    if (!request.headers.cookie?.includes('hop_one=1')) {
      response.statusCode = 403
      response.end('missing first-hop cookie')
      return
    }
    response.statusCode = 303
    response.setHeader('location', '/final')
    response.setHeader('set-cookie', 'hop_two=2; Path=/final; HttpOnly')
    response.end()
    return
  }
  if (request.url === '/final') {
    const cookie = request.headers.cookie ?? ''
    response.statusCode = cookie.includes('hop_one=1') && cookie.includes('hop_two=2') ? 200 : 403
    response.setHeader('content-type', 'text/html; charset=utf-8')
    response.end(`<html><body>${cookie}</body></html>`)
    return
  }
  if (request.url === '/outside') {
    response.statusCode = 302
    response.setHeader('location', 'https://example.com/should-not-be-followed')
    response.end()
    return
  }
  if (request.url?.startsWith('/loop')) {
    const current = Number(new URL(request.url, 'http://localhost').searchParams.get('n') || 0)
    response.statusCode = 302
    response.setHeader('location', `/loop?n=${current + 1}`)
    response.end()
    return
  }
  response.statusCode = 404
  response.end('not found')
})

await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})

try {
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  const { ProviderHttpSession } = await import('../apps/bot/dist/services/download-providers/http.js')
  const allowed = [/^127\.0\.0\.1$/]
  const session = new ProviderHttpSession()

  const result = await session.fetchHtml(`${origin}/start`, allowed)
  assert.equal(result.finalUrl, `${origin}/final`)
  assert.match(result.html, /hop_one=1/)
  assert.match(result.html, /hop_two=2/)
  assert.match(session.cookieHeader(`${origin}/anything`), /hop_one=1/)
  assert.doesNotMatch(session.cookieHeader(`${origin}/anything`), /hop_two=2/)
  assert.match(session.cookieHeader(`${origin}/final/child`), /hop_two=2/)

  await assert.rejects(
    session.fetchHtml(`${origin}/outside`, allowed),
    /Host de proveedor no permitido: example\.com/,
  )

  await assert.rejects(
    session.fetchHtml(`${origin}/loop?n=0`, allowed),
    /superó 8 redirecciones HTML/,
  )

  console.log('[V2 PHASE 3 HTTP] OK — redirect-hop cookies are retained, redirect hosts are allowlisted, and redirect depth is bounded.')
} finally {
  await new Promise((resolve) => server.close(() => resolve()))
  await rm(temp, { recursive: true, force: true })
}
