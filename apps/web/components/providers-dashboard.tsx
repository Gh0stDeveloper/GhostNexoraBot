import { Activity, CircuitBoard, Clock3, Database, Gauge, ServerCog, ShieldCheck } from 'lucide-react'
import type { OpsProviderHealth } from '../lib/ops'
import type { WebLocale } from '../lib/i18n'
import { opsExtraT } from '../lib/ops-extra-i18n'

type ProviderCatalogRow = {
  id: string
  label: string
  configured: boolean
  category: string
  primary?: boolean
}

type ProviderViewRow = ProviderCatalogRow & {
  telemetry: OpsProviderHealth | null
}

function configured(name: string) {
  return Boolean(process.env[name]?.trim())
}

function providerCatalog(): ProviderCatalogRow[] {
  return [
    {
      id: 'lempi',
      label: 'LemPi',
      configured: configured('LEMPI_API_KEYS') || configured('LEMPI_API_KEY'),
      category: 'Media API',
      primary: true,
    },
    {
      id: 'spotify',
      label: 'Spotify',
      configured: configured('SPOTIFY_CLIENT_ID') && configured('SPOTIFY_CLIENT_SECRET'),
      category: 'Music API',
      primary: true,
    },
    {
      id: 'jikan',
      label: 'Jikan',
      configured: true,
      category: 'Anime metadata',
      primary: true,
    },
    {
      id: 'anime1v',
      label: 'Anime1v',
      configured: configured('ANIME1V_API_URL'),
      category: 'Anime streaming',
      primary: true,
    },
    {
      id: 'openrouter',
      label: 'OpenRouter',
      configured: configured('OPENROUTER_API_KEY'),
      category: 'AI API',
      primary: true,
    },
  ]
}

function latency(ms: number) {
  if (!ms) return '0 ms'
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`
  return `${Math.round(ms)} ms`
}

function dateTime(value: number, locale: WebLocale, empty: string) {
  if (!value) return empty
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function displayStatus(row: ProviderViewRow) {
  if (!row.configured && !row.telemetry?.requests) return 'disabled' as const
  return row.telemetry?.status ?? 'unknown'
}

function statusClass(status: ReturnType<typeof displayStatus>) {
  if (status === 'online') return 'ops-badge-good'
  if (status === 'degraded' || status === 'unknown') return 'ops-badge-warn'
  return 'ops-badge-bad'
}

function circuitClass(state: OpsProviderHealth['circuitState']) {
  if (state === 'closed') return 'ops-badge-good'
  if (state === 'half-open') return 'ops-badge-warn'
  return 'ops-badge-bad'
}

function ProviderCard({ row, locale }: { row: ProviderViewRow; locale: WebLocale }) {
  const t = (key: Parameters<typeof opsExtraT>[1]) => opsExtraT(locale, key)
  const p = row.telemetry
  const status = displayStatus(row)
  const statusLabel = status === 'disabled'
    ? t('provider.status.disabled')
    : t(`provider.status.${status}` as Parameters<typeof opsExtraT>[1])
  const requests = p?.requests ?? 0
  const successes = p?.successes ?? 0
  const failures = p?.failures ?? 0
  const successRate = requests ? successes / requests * 100 : 0
  const circuit = p?.circuitState ?? 'closed'

  return <article className="ops-panel overflow-hidden">
    <div className="border-b border-white/[.07] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-black text-white">{row.label}</h3>
            <span className={statusClass(status)}>{statusLabel}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-600">{row.category}</p>
        </div>
        <span className={row.configured ? 'ops-badge-good' : 'ops-badge-warn'}>
          {row.configured ? t('provider.configured') : t('provider.notConfigured')}
        </span>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-px bg-white/[.05]">
      <div className="bg-[#090b10] p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{t('provider.requests')}</p>
        <p className="mt-2 font-mono text-lg font-black text-zinc-100">{requests.toLocaleString()}</p>
      </div>
      <div className="bg-[#090b10] p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{t('provider.successRate')}</p>
        <p className="mt-2 font-mono text-lg font-black text-zinc-100">{requests ? `${successRate.toFixed(1)}%` : '—'}</p>
      </div>
      <div className="bg-[#090b10] p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{t('provider.avg')}</p>
        <p className="mt-2 font-mono text-sm font-bold text-zinc-200">{latency(p?.averageLatencyMs ?? 0)}</p>
      </div>
      <div className="bg-[#090b10] p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{t('provider.last')}</p>
        <p className="mt-2 font-mono text-sm font-bold text-zinc-200">{latency(p?.lastLatencyMs ?? 0)}</p>
      </div>
    </div>

    <div className="space-y-3 p-5 text-xs">
      <div className="flex items-center justify-between gap-4">
        <span className="text-zinc-600">{t('provider.successes')}</span>
        <strong className="font-mono text-emerald-300">{successes.toLocaleString()}</strong>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-zinc-600">{t('provider.failures')}</span>
        <strong className={failures ? 'font-mono text-red-300' : 'font-mono text-zinc-300'}>{failures.toLocaleString()}</strong>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-zinc-600">{t('provider.circuit')}</span>
        <span className={circuitClass(circuit)}>{t(`provider.circuit.${circuit}` as Parameters<typeof opsExtraT>[1])}</span>
      </div>
      <div className="flex items-start justify-between gap-4">
        <span className="shrink-0 text-zinc-600">{t('provider.lastSuccess')}</span>
        <span className="text-right text-zinc-400">{dateTime(p?.lastSuccessAt ?? 0, locale, t('provider.never'))}</span>
      </div>
      <div className="flex items-start justify-between gap-4">
        <span className="shrink-0 text-zinc-600">{t('provider.lastFailure')}</span>
        <span className="text-right text-zinc-400">{dateTime(p?.lastFailureAt ?? 0, locale, t('provider.never'))}</span>
      </div>
      <div>
        <p className="text-zinc-600">{t('provider.lastError')}</p>
        <p className={p?.lastError ? 'mt-1 break-all rounded-lg border border-red-500/10 bg-red-500/[.04] px-3 py-2 font-mono text-[11px] text-red-300' : 'mt-1 text-zinc-500'}>
          {p?.lastError || t('provider.noError')}
        </p>
      </div>
    </div>
  </article>
}

export function ProvidersDashboard({ providers, instanceLabel, locale }: {
  providers: OpsProviderHealth[]
  instanceLabel: string
  locale: WebLocale
}) {
  const t = (key: Parameters<typeof opsExtraT>[1]) => opsExtraT(locale, key)
  const byId = new Map(providers.map((provider) => [provider.providerId, provider]))
  const catalog = providerCatalog()
  const knownIds = new Set(catalog.map((provider) => provider.id))
  const primary: ProviderViewRow[] = catalog.map((provider) => ({
    ...provider,
    telemetry: byId.get(provider.id) ?? null,
  }))
  const others: ProviderViewRow[] = providers
    .filter((provider) => !knownIds.has(provider.providerId))
    .map((provider) => ({
      id: provider.providerId,
      label: provider.label,
      configured: true,
      category: t('provider.detectedRuntime'),
      telemetry: provider,
    }))

  const all = [...primary, ...others]
  const telemetryRows = providers.filter((provider) => provider.requests > 0)
  const totalRequests = telemetryRows.reduce((sum, provider) => sum + provider.requests, 0)
  const totalSuccesses = telemetryRows.reduce((sum, provider) => sum + provider.successes, 0)
  const incidents = all.filter((row) => {
    const status = displayStatus(row)
    return status === 'degraded' || status === 'offline' || row.telemetry?.circuitState === 'open'
  }).length
  const online = all.filter((row) => displayStatus(row) === 'online').length
  const successRate = totalRequests ? totalSuccesses / totalRequests * 100 : 0

  return <div className="space-y-6">
    <section className="ops-panel p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]">
          <ServerCog className="size-5 text-blue-400"/>
        </span>
        <div>
          <h2 className="font-black text-white">{t('provider.dashboardTitle')}</h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-zinc-500">{t('provider.dashboardSubtitle')}</p>
          <p className="mt-1 font-mono text-[11px] text-zinc-700">{instanceLabel}</p>
        </div>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[
        [Database, t('provider.summaryTracked'), all.length.toLocaleString()],
        [ShieldCheck, t('provider.summaryOnline'), online.toLocaleString()],
        [Activity, t('provider.summaryIncidents'), incidents.toLocaleString()],
        [Gauge, t('provider.summaryRequests'), totalRequests.toLocaleString()],
        [Clock3, t('provider.summarySuccess'), totalRequests ? `${successRate.toFixed(1)}%` : '—'],
      ].map(([Icon, label, value]) => {
        const I = Icon as typeof Database
        return <article key={String(label)} className="ops-stat">
          <I className="size-4 text-blue-400"/>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-600">{String(label)}</p>
          <p className="mt-2 text-2xl font-black text-white">{String(value)}</p>
        </article>
      })}
    </section>

    <section>
      <div className="mb-3 flex items-center gap-2">
        <CircuitBoard className="size-4 text-blue-400"/>
        <h3 className="text-sm font-black uppercase tracking-wide text-zinc-300">{t('provider.primary')}</h3>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {primary.map((row) => <ProviderCard key={row.id} row={row} locale={locale}/>)}
      </div>
    </section>

    <section>
      <div className="mb-3 flex items-center gap-2">
        <Activity className="size-4 text-blue-400"/>
        <h3 className="text-sm font-black uppercase tracking-wide text-zinc-300">{t('provider.others')}</h3>
      </div>
      {others.length
        ? <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{others.map((row) => <ProviderCard key={row.id} row={row} locale={locale}/>)}</div>
        : <div className="ops-panel px-5 py-10 text-center text-sm text-zinc-600">{t('provider.othersEmpty')}</div>}
    </section>
  </div>
}
