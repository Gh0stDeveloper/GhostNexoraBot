'use client'

import { useCallback, useEffect, useState } from 'react'
import { useWebI18n } from '../../components/i18n-provider'

const PROXY = '/proxy'

function normalizeUrl(raw: string) {
  let u = (raw || '').trim()
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  return u
}

export function BrowserClient({ initialUrl }: { initialUrl: string }) {
  const { t, intlLocale } = useWebI18n()
  const [url, setUrl] = useState(normalizeUrl(initialUrl) || 'https://example.com')
  const [status, setStatus] = useState(t('browser.ready'))
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (target?: string) => {
    const next = normalizeUrl(target ?? url)
    if (!next) {
      setStatus(t('browser.enterUrl'))
      return
    }
    setUrl(next)
    setLoading(true)
    setStatus(t('browser.loading', { url: next }))
    try {
      const res = await fetch(`${PROXY}?url=${encodeURIComponent(next)}&format=html`)
      if (!res.ok) {
        const responseText = await res.text()
        throw new Error(responseText.slice(0, 200) || `HTTP ${res.status}`)
      }
      const body = await res.text()
      if (!body || body.length < 20) throw new Error(t('browser.emptyProxy'))
      if (body.includes('/_next/static') && body.includes('__NEXT_DATA__')) {
        throw new Error(t('browser.nextProxyError'))
      }
      setHtml(body)
      setStatus(`OK · ${body.length.toLocaleString(intlLocale)} chars`)
      try {
        const current = new URL(window.location.href)
        current.searchParams.set('url', next)
        window.history.replaceState({}, '', current.toString())
      } catch {
        /* ignore */
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus(`Error: ${message}`)
      setHtml(
        `<!doctype html><html><body style="font-family:system-ui;padding:24px;background:#111;color:#eee"><h3>${t('browser.failed')}</h3><p>${message.replace(/</g, '&lt;')}</p></body></html>`,
      )
    } finally {
      setLoading(false)
    }
  }, [intlLocale, t, url])

  useEffect(() => {
    void load(initialUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl])

  return (
    <div
      style={{
        margin: 0,
        minHeight: '100vh',
        background: '#0f1115',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, Arial, sans-serif',
        padding: 12,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#9aa0a6', minWidth: 28 }}>url</span>
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void load()
          }}
          inputMode="url"
          autoComplete="off"
          style={{
            flex: 1,
            background: '#1b1d22',
            border: '1.5px solid #ffb300',
            color: '#fff',
            padding: '10px 12px',
            borderRadius: 10,
            outline: 'none',
            fontSize: 13,
          }}
        />
      </div>
      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        style={{
          width: '100%',
          marginTop: 10,
          background: 'linear-gradient(90deg,#7c5cff,#5a8bff)',
          color: '#fff',
          border: 'none',
          padding: 12,
          borderRadius: 12,
          fontWeight: 700,
          fontSize: 14,
          opacity: loading ? 0.7 : 1,
          cursor: 'pointer',
        }}
      >
        {loading ? t('common.loading') : t('common.search')}
      </button>
      <div
        style={{
          fontSize: 11,
          color: '#9aa0a6',
          marginTop: 8,
          textAlign: 'center',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {status}
      </div>
      <iframe
        title="view"
        srcDoc={html || undefined}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        style={{
          width: '100%',
          height: 'min(70vh, 720px)',
          border: 'none',
          background: '#fff',
          borderRadius: 12,
          marginTop: 12,
          display: 'block',
        }}
      />
      <p style={{ fontSize: 10, color: '#6b7280', textAlign: 'center', marginTop: 10 }}>
        {t('browser.realContent')}
      </p>
    </div>
  )
}
