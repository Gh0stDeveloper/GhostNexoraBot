import { NextResponse } from 'next/server'
import { publicReleaseCatalog } from '../../../lib/releases'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(publicReleaseCatalog(), {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
