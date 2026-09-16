import { NextRequest } from 'next/server'
import { artifactContentType, artifactStream, resolveReleaseArtifact } from '../../../../lib/releases'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function commonHeaders(filename: string, kind: Parameters<typeof artifactContentType>[0], size: number, sha256: string) {
  return new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=3600, immutable',
    'Content-Disposition': `attachment; filename="${filename.replace(/["\\\r\n]/g, '_')}"`,
    'Content-Type': artifactContentType(kind),
    'ETag': `"sha256-${sha256}"`,
    'X-Content-Type-Options': 'nosniff',
    'X-Ghost-Nexora-SHA256': sha256,
    'Content-Length': String(size),
  })
}

function parseRange(value: string | null, size: number) {
  if (!value) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim())
  if (!match) return { invalid: true as const }
  let start = match[1] ? Number(match[1]) : NaN
  let end = match[2] ? Number(match[2]) : NaN
  if (Number.isNaN(start) && Number.isNaN(end)) return { invalid: true as const }
  if (Number.isNaN(start)) {
    const suffix = Math.min(end, size)
    start = size - suffix
    end = size - 1
  } else if (Number.isNaN(end)) {
    end = size - 1
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return { invalid: true as const }
  end = Math.min(end, size - 1)
  return { start, end }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? ''
  const resolved = resolveReleaseArtifact(id)
  if (!resolved) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

  const { artifact, file, stat } = resolved
  const range = parseRange(request.headers.get('range'), stat.size)
  if (range && 'invalid' in range) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}`, 'Cache-Control': 'no-store' } })
  }

  if (range) {
    const length = range.end - range.start + 1
    const headers = commonHeaders(artifact.filename, artifact.kind, length, artifact.sha256)
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`)
    return new Response(artifactStream(file, range.start, range.end), { status: 206, headers })
  }

  return new Response(artifactStream(file), { status: 200, headers: commonHeaders(artifact.filename, artifact.kind, stat.size, artifact.sha256) })
}

export async function HEAD(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? ''
  const resolved = resolveReleaseArtifact(id)
  if (!resolved) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const { artifact, stat } = resolved
  return new Response(null, { status: 200, headers: commonHeaders(artifact.filename, artifact.kind, stat.size, artifact.sha256) })
}
