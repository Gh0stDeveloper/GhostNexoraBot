import { BrowserClient } from './browser-client'

export const dynamic = 'force-dynamic'

export default function BrowserPage({
  searchParams,
}: {
  searchParams: { url?: string }
}) {
  const initial = (searchParams?.url || 'https://example.com').trim()
  return <BrowserClient initialUrl={initial} />
}
