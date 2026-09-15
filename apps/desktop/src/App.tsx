import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  Bot,
  ChevronRight,
  CircleDot,
  Cpu,
  Gauge,
  Languages,
  LayoutDashboard,
  MessageCircle,
  Network,
  Play,
  Power,
  QrCode,
  RefreshCw,
  RotateCw,
  Save,
  Search,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Terminal,
  Unplug,
  Wifi,
  WifiOff,
} from 'lucide-react'
import type {
  ConfigResponse,
  LogEntry,
  LogsResponse,
  PairStatusResponse,
  RuntimeAction,
  RuntimeMetricsResponse,
  RuntimeStatusResponse,
} from '@ghostnexora/control-api-contracts'
import { control, type ConnectionProfile } from './control'
import { makeTranslator, type Locale } from './i18n'

type View = 'overview' | 'platforms' | 'pairing' | 'activity' | 'settings'
type LogLevelFilter = 'all' | LogEntry['level']

const initialBaseUrl = window.localStorage.getItem('ghostnexora.manager.baseUrl') || 'http://127.0.0.1:3002'
const initialLocale = (window.localStorage.getItem('ghostnexora.manager.locale') === 'en' ? 'en' : 'es') as Locale
const initial: ConnectionProfile = { baseUrl: initialBaseUrl, token: '' }

export default function App() {
  const [locale, setLocale] = useState<Locale>(initialLocale)
  const t = useMemo(() => makeTranslator(locale), [locale])
  const [view, setView] = useState<View>('overview')
  const [connection, setConnection] = useState(initial)
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState<RuntimeStatusResponse | null>(null)
  const [metrics, setMetrics] = useState<RuntimeMetricsResponse | null>(null)
  const [logs, setLogs] = useState<LogsResponse | null>(null)
  const [config, setConfig] = useState<ConfigResponse['config'] | null>(null)
  const [pair, setPair] = useState<PairStatusResponse | null>(null)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [logQuery, setLogQuery] = useState('')
  const [logLevel, setLogLevel] = useState<LogLevelFilter>('all')

  useEffect(() => {
    window.localStorage.setItem('ghostnexora.manager.locale', locale)
  }, [locale])

  useEffect(() => {
    window.localStorage.setItem('ghostnexora.manager.baseUrl', connection.baseUrl)
  }, [connection.baseUrl])

  async function refresh(profile = connection, silent = false) {
    if (!silent) setBusy(true)
    setError('')
    try {
      const s = await control.status(profile)
      setStatus(s)
      setConnected(true)
      if (s.runtime.state === 'offline') {
        setMetrics(null)
        setLogs(null)
        setConfig(null)
        return
      }
      const [m, l, c] = await Promise.allSettled([
        control.metrics(profile),
        control.logs(profile),
        control.config(profile),
      ])
      if (m.status === 'fulfilled') setMetrics(m.value)
      if (l.status === 'fulfilled') setLogs(l.value)
      if (c.status === 'fulfilled') setConfig(c.value.config)
    } catch (e) {
      setConnected(false)
      setStatus(null)
      setMetrics(null)
      setLogs(null)
      setConfig(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (!silent) setBusy(false)
    }
  }

  useEffect(() => {
    if (!connected) return
    const id = window.setInterval(() => void refresh(connection, true), 8_000)
    return () => window.clearInterval(id)
  }, [connected, connection.baseUrl, connection.token])

  useEffect(() => {
    if (!connected || pair?.state !== 'waiting') return
    const id = window.setInterval(async () => {
      try {
        setPair(await control.pairStatus(connection))
      } catch {
        // Pairing polling is best-effort; main connection state remains authoritative.
      }
    }, 3_000)
    return () => window.clearInterval(id)
  }, [connected, pair?.state, connection.baseUrl, connection.token])

  async function runtime(action: RuntimeAction) {
    setBusy(true)
    setError('')
    try {
      const result = await control.runtime(connection, action)
      if (!result.accepted && result.managerRequired) throw new Error(t('managerRequired'))
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  async function platform(id: 'whatsapp' | 'telegram' | 'discord', next: boolean) {
    setBusy(true)
    setError('')
    try {
      await control.platform(connection, id, next)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  async function pairStart(mode: 'qr' | 'code') {
    setBusy(true)
    setError('')
    try {
      const result = await control.pairStart(connection, {
        platform: 'whatsapp',
        mode,
        phoneNumber: mode === 'code' ? phone : undefined,
      })
      setPair(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveConfig() {
    if (!config) return
    setBusy(true)
    setError('')
    try {
      const result = await control.patchConfig(connection, {
        botName: config.botName,
        prefix: config.prefix,
        language: config.language,
      })
      setConfig(result.config)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  function disconnect() {
    setConnected(false)
    setConnection((current) => ({ ...current, token: '' }))
    setStatus(null)
    setMetrics(null)
    setLogs(null)
    setConfig(null)
    setPair(null)
    setError('')
  }

  const runtimeOffline = status?.runtime.state === 'offline'
  const runtimeOnline = status?.runtime.state === 'online'
  const heapPercent = metrics?.memory.heapTotalBytes
    ? Math.min(100, Math.round((metrics.memory.heapUsedBytes / metrics.memory.heapTotalBytes) * 100))
    : 0
  const connectedPlatforms = status?.platforms.filter((item) => item.connected).length ?? 0
  const filteredLogs = useMemo(() => {
    const query = logQuery.trim().toLowerCase()
    return (logs?.entries ?? []).filter((entry) => {
      const levelMatches = logLevel === 'all' || entry.level === logLevel
      const queryMatches = !query || entry.message.toLowerCase().includes(query)
      return levelMatches && queryMatches
    })
  }, [logs, logLevel, logQuery])

  const pageMeta: Record<View, { title: string; subtitle: string }> = {
    overview: { title: t('overview'), subtitle: t('overviewSubtitle') },
    platforms: { title: t('platforms'), subtitle: t('platformsSubtitle') },
    pairing: { title: t('pairing'), subtitle: t('pairingSubtitle') },
    activity: { title: t('activity'), subtitle: t('activitySubtitle') },
    settings: { title: t('settings'), subtitle: t('settingsSubtitle') },
  }

  return <div className="desktop-shell">
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark"><Sparkles size={19}/></div>
        <div><strong>Ghost Nexora</strong><span>Manager V2</span></div>
      </div>

      <nav className="nav-list" aria-label={t('navigation')}>
        <NavButton active={view === 'overview'} icon={<LayoutDashboard/>} label={t('overview')} onClick={() => setView('overview')}/>
        <NavButton active={view === 'platforms'} icon={<Network/>} label={t('platforms')} onClick={() => setView('platforms')}/>
        <NavButton active={view === 'pairing'} icon={<QrCode/>} label={t('pairingShort')} onClick={() => setView('pairing')}/>
        <NavButton active={view === 'activity'} icon={<Terminal/>} label={t('activity')} onClick={() => setView('activity')}/>
        <NavButton active={view === 'settings'} icon={<Settings/>} label={t('settings')} onClick={() => setView('settings')}/>
      </nav>

      <div className="sidebar-spacer"/>
      <div className={`connection-summary ${connected ? 'is-online' : ''}`}>
        <span className="status-dot"/>
        <div><strong>{connected ? t('managerOnline') : t('managerOffline')}</strong><small>{connected ? connection.baseUrl : t('notConnected')}</small></div>
      </div>
      <div className="sidebar-actions">
        <button className="sidebar-icon-button" onClick={() => setLocale(locale === 'es' ? 'en' : 'es')} title={t('language')}>
          <Languages size={17}/><span>{locale.toUpperCase()}</span>
        </button>
        <button className="sidebar-icon-button" disabled={!connected || busy} onClick={() => void refresh()} title={t('refresh')}>
          <RefreshCw size={17} className={busy ? 'spin' : ''}/>
        </button>
      </div>
    </aside>

    <main className="workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">NEXORA CONTROL CENTER</p>
          <h1>{pageMeta[view].title}</h1>
          <p>{pageMeta[view].subtitle}</p>
        </div>
        <div className="header-status">
          <span className={`runtime-pill state-${status?.runtime.state ?? 'offline'}`}>
            <CircleDot size={14}/>{status?.runtime.state ?? t('offline')}
          </span>
          <button className="icon-button" disabled={!connected || busy} onClick={() => void refresh()} title={t('refresh')}>
            <RefreshCw size={17} className={busy ? 'spin' : ''}/>
          </button>
        </div>
      </header>

      {error && <div className="alert error-alert"><WifiOff size={17}/><div><strong>{t('actionFailed')}</strong><span>{friendlyError(error, t)}</span></div></div>}

      {!connected && view !== 'settings' && <ConnectionGate
        connection={connection}
        busy={busy}
        onConnection={setConnection}
        onConnect={() => void refresh()}
        onSettings={() => setView('settings')}
        t={t}
      />}

      {view === 'overview' && connected && <Overview
        status={status}
        metrics={metrics}
        logs={logs}
        busy={busy}
        heapPercent={heapPercent}
        connectedPlatforms={connectedPlatforms}
        runtimeOffline={runtimeOffline}
        runtimeOnline={runtimeOnline}
        runtime={runtime}
        setView={setView}
        t={t}
      />}

      {view === 'platforms' && connected && <PlatformsView
        status={status}
        busy={busy}
        runtimeOffline={runtimeOffline}
        platform={platform}
        t={t}
      />}

      {view === 'pairing' && connected && <PairingView
        pair={pair}
        phone={phone}
        setPhone={setPhone}
        runtimeOffline={runtimeOffline}
        busy={busy}
        pairStart={pairStart}
        t={t}
      />}

      {view === 'activity' && connected && <ActivityView
        logs={filteredLogs}
        logQuery={logQuery}
        setLogQuery={setLogQuery}
        logLevel={logLevel}
        setLogLevel={setLogLevel}
        t={t}
      />}

      {view === 'settings' && <SettingsView
        connection={connection}
        setConnection={setConnection}
        connected={connected}
        busy={busy}
        config={config}
        setConfig={setConfig}
        locale={locale}
        setLocale={setLocale}
        onConnect={() => void refresh()}
        onDisconnect={disconnect}
        onSave={() => void saveConfig()}
        t={t}
      />}
    </main>
  </div>
}

function Overview({
  status, metrics, logs, busy, heapPercent, connectedPlatforms, runtimeOffline, runtimeOnline, runtime, setView, t,
}: {
  status: RuntimeStatusResponse | null
  metrics: RuntimeMetricsResponse | null
  logs: LogsResponse | null
  busy: boolean
  heapPercent: number
  connectedPlatforms: number
  runtimeOffline: boolean | undefined
  runtimeOnline: boolean
  runtime: (action: RuntimeAction) => Promise<void>
  setView: (view: View) => void
  t: ReturnType<typeof makeTranslator>
}) {
  return <div className="page-stack">
    <section className="runtime-hero panel-surface">
      <div className="hero-copy">
        <div className="hero-status-row">
          <span className={`live-indicator ${runtimeOnline ? 'online' : ''}`}><span/>{runtimeOnline ? t('operational') : status?.runtime.state ?? t('offline')}</span>
          <span className="profile-chip">{status?.runtime.profile ?? 'full'}</span>
        </div>
        <h2>{status?.runtime.botName || 'Ghost Nexora Bot'}</h2>
        <p>{t('runtimeHeroHint')}</p>
        <div className="runtime-meta">
          <span><SlidersHorizontal size={15}/>{t('prefix')}: <b>{status?.runtime.prefix ?? '—'}</b></span>
          <span><Cpu size={15}/>PID: <b>{metrics?.process.pid ?? '—'}</b></span>
          <span><Activity size={15}/>{formatDuration(status?.runtime.uptimeSeconds ?? 0)}</span>
        </div>
      </div>
      <div className="hero-actions">
        <button className="primary action-large" disabled={busy || !runtimeOffline} onClick={() => void runtime('start')}><Play size={17}/>{t('start')}</button>
        <button className="secondary action-large" disabled={busy || runtimeOffline} onClick={() => void runtime('stop')}><Square size={16}/>{t('stop')}</button>
        <button className="secondary action-large" disabled={busy || runtimeOffline} onClick={() => void runtime('restart')}><RotateCw size={16}/>{t('restart')}</button>
        <button className="secondary action-large" disabled={busy} onClick={() => void runtime('update')}><RefreshCw size={16}/>{t('update')}</button>
      </div>
    </section>

    <section className="metrics-row">
      <MetricCard icon={<Gauge/>} label={t('uptime')} value={formatDuration(status?.runtime.uptimeSeconds ?? 0)} hint={t('runtimeProcess')}/>
      <MetricCard icon={<Server/>} label={t('memory')} value={metrics ? formatBytes(metrics.memory.rssBytes) : '—'} hint={`${heapPercent}% ${t('heapUsed')}`} progress={heapPercent}/>
      <MetricCard icon={<Network/>} label={t('platforms')} value={`${connectedPlatforms}/${status?.platforms.length ?? 0}`} hint={t('connectedNow')}/>
      <MetricCard icon={<Bot/>} label={t('subbots')} value={`${status?.subbots.online ?? 0}/${status?.subbots.total ?? 0}`} hint={`${status?.subbots.pending ?? 0} ${t('pending')}`}/>
    </section>

    <section className="overview-grid">
      <article className="panel-surface section-card">
        <SectionHeader title={t('platforms')} subtitle={t('platformsCompactHint')} action={<button className="text-button" onClick={() => setView('platforms')}>{t('manage')}<ChevronRight size={15}/></button>}/>
        <div className="compact-platforms">
          {status?.platforms.map((item) => <div className="compact-platform" key={item.id}>
            <PlatformGlyph id={item.id}/>
            <div><strong>{platformLabel(item.id)}</strong><span>{item.accountLabel || item.state}</span></div>
            <span className={`status-badge ${item.connected ? 'online' : ''}`}>{item.connected ? t('online') : t('offline')}</span>
          </div>) ?? <EmptyState text={t('noData')}/>} 
        </div>
      </article>

      <article className="panel-surface section-card">
        <SectionHeader title={t('recentActivity')} subtitle={t('recentActivityHint')} action={<button className="text-button" onClick={() => setView('activity')}>{t('openConsole')}<ChevronRight size={15}/></button>}/>
        <div className="mini-log-list">
          {logs?.entries.slice(-5).reverse().map((entry) => <div className="mini-log" key={entry.cursor}>
            <span className={`log-dot ${entry.level}`}/>
            <div><strong>{entry.message}</strong><span>{new Date(entry.timestamp).toLocaleTimeString()}</span></div>
          </div>) ?? <EmptyState text={t('noData')}/>} 
        </div>
      </article>
    </section>
  </div>
}

function PlatformsView({ status, busy, runtimeOffline, platform, t }: {
  status: RuntimeStatusResponse | null
  busy: boolean
  runtimeOffline: boolean | undefined
  platform: (id: 'whatsapp' | 'telegram' | 'discord', next: boolean) => Promise<void>
  t: ReturnType<typeof makeTranslator>
}) {
  return <div className="page-stack">
    <section className="platform-cards">
      {status?.platforms.map((item) => <article className="platform-card panel-surface" key={item.id}>
        <div className="platform-card-top">
          <PlatformGlyph id={item.id}/>
          <span className={`status-badge ${item.connected ? 'online' : ''}`}><span className="status-dot"/>{item.connected ? t('online') : t('offline')}</span>
        </div>
        <h2>{platformLabel(item.id)}</h2>
        <p>{item.detail || item.accountLabel || t('platformReady')}</p>
        <div className="platform-meta"><span>{t('state')}</span><b>{item.state}</b></div>
        <div className="platform-meta"><span>{t('enabled')}</span><b>{item.enabled ? t('yes') : t('no')}</b></div>
        <button className={item.connected ? 'secondary full-width' : 'primary full-width'} disabled={busy || runtimeOffline || (!item.enabled && !item.connected)} onClick={() => void platform(item.id, !item.connected)}>
          {item.connected ? <Unplug size={16}/> : <Wifi size={16}/>} {item.connected ? t('disconnect') : t('connect')}
        </button>
      </article>) ?? <EmptyState text={t('noData')}/>} 
    </section>

    <section className="panel-surface section-card">
      <SectionHeader title={t('subbots')} subtitle={t('subbotsHint')}/>
      <div className="subbot-summary">
        <SummaryStat label={t('online')} value={status?.subbots.online ?? 0}/>
        <SummaryStat label={t('pending')} value={status?.subbots.pending ?? 0}/>
        <SummaryStat label={t('offline')} value={status?.subbots.offline ?? 0}/>
        <SummaryStat label={t('total')} value={status?.subbots.total ?? 0}/>
      </div>
    </section>
  </div>
}

function PairingView({ pair, phone, setPhone, runtimeOffline, busy, pairStart, t }: {
  pair: PairStatusResponse | null
  phone: string
  setPhone: (value: string) => void
  runtimeOffline: boolean | undefined
  busy: boolean
  pairStart: (mode: 'qr' | 'code') => Promise<void>
  t: ReturnType<typeof makeTranslator>
}) {
  return <div className="pair-layout">
    <section className="panel-surface pair-control">
      <div className="pair-icon"><QrCode size={26}/></div>
      <h2>{t('linkWhatsApp')}</h2>
      <p>{t('pairingLongHint')}</p>
      <div className="step-list">
        <span><b>1</b>{t('pairStepOne')}</span>
        <span><b>2</b>{t('pairStepTwo')}</span>
        <span><b>3</b>{t('pairStepThree')}</span>
      </div>
      <label className="field"><span>{t('phone')}</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+52 55 1234 5678"/></label>
      <div className="pair-actions">
        <button className="primary" disabled={runtimeOffline || busy} onClick={() => void pairStart('code')}><MessageCircle size={16}/>{t('pairCode')}</button>
        <button className="secondary" disabled={runtimeOffline || busy} onClick={() => void pairStart('qr')}><QrCode size={16}/>{t('pairQr')}</button>
      </div>
      {runtimeOffline && <p className="inline-note"><Power size={15}/>{t('runtimeMustBeOnline')}</p>}
    </section>

    <section className="panel-surface pair-preview">
      <div className={`pair-state-orb state-${pair?.state ?? 'idle'}`}><QrCode size={34}/></div>
      <span className="pair-state-label">{pair?.state ?? t('idle')}</span>
      {pair?.pairingCode ? <>
        <p>{t('enterThisCode')}</p>
        <code className="pairing-code">{pair.pairingCode}</code>
      </> : pair?.qr ? <>
        <p>{t('qrReady')}</p>
        <textarea className="qr-payload" readOnly value={pair.qr}/>
        <small>{t('qrPayloadHint')}</small>
      </> : <>
        <h3>{t('waitingForPair')}</h3>
        <p>{t('waitingForPairHint')}</p>
      </>}
      {pair?.expiresAt && <small>{t('expires')}: {new Date(pair.expiresAt).toLocaleTimeString()}</small>}
      {pair?.detail && <small>{pair.detail}</small>}
    </section>
  </div>
}

function ActivityView({ logs, logQuery, setLogQuery, logLevel, setLogLevel, t }: {
  logs: LogEntry[]
  logQuery: string
  setLogQuery: (value: string) => void
  logLevel: LogLevelFilter
  setLogLevel: (value: LogLevelFilter) => void
  t: ReturnType<typeof makeTranslator>
}) {
  return <section className="panel-surface console-panel">
    <div className="console-toolbar">
      <div className="search-box"><Search size={16}/><input value={logQuery} onChange={(event) => setLogQuery(event.target.value)} placeholder={t('searchLogs')}/></div>
      <div className="level-filters">
        {(['all', 'info', 'warn', 'error', 'debug'] as LogLevelFilter[]).map((level) => <button key={level} className={logLevel === level ? 'filter-chip active' : 'filter-chip'} onClick={() => setLogLevel(level)}>{level}</button>)}
      </div>
    </div>
    <div className="console-list">
      {logs.length ? logs.slice().reverse().map((entry) => <div className="console-row" key={entry.cursor}>
        <time>{new Date(entry.timestamp).toLocaleTimeString()}</time>
        <span className={`level-pill ${entry.level}`}>{entry.level}</span>
        <p>{entry.message}</p>
      </div>) : <EmptyState text={t('noLogsMatch')}/>} 
    </div>
  </section>
}

function SettingsView({
  connection, setConnection, connected, busy, config, setConfig, locale, setLocale, onConnect, onDisconnect, onSave, t,
}: {
  connection: ConnectionProfile
  setConnection: (value: ConnectionProfile) => void
  connected: boolean
  busy: boolean
  config: ConfigResponse['config'] | null
  setConfig: (value: ConfigResponse['config']) => void
  locale: Locale
  setLocale: (value: Locale) => void
  onConnect: () => void
  onDisconnect: () => void
  onSave: () => void
  t: ReturnType<typeof makeTranslator>
}) {
  return <div className="settings-grid">
    <section className="panel-surface section-card settings-card">
      <SectionHeader title={t('managerConnection')} subtitle={t('managerConnectionHint')} icon={<Server size={18}/>}/>
      <label className="field"><span>{t('url')}</span><input value={connection.baseUrl} onChange={(event) => setConnection({ ...connection, baseUrl: event.target.value })}/></label>
      <label className="field"><span>{t('token')}</span><input type="password" autoComplete="off" value={connection.token} onChange={(event) => setConnection({ ...connection, token: event.target.value })}/></label>
      <div className="settings-actions">
        <button className="primary" disabled={busy} onClick={onConnect}><Wifi size={16}/>{connected ? t('reconnect') : t('connect')}</button>
        {connected && <button className="secondary" onClick={onDisconnect}><Unplug size={16}/>{t('disconnect')}</button>}
      </div>
      <div className="security-note"><ShieldCheck size={17}/><div><strong>{t('secureConnection')}</strong><span>{t('remoteNotice')}</span></div></div>
    </section>

    <section className="panel-surface section-card settings-card">
      <SectionHeader title={t('botConfiguration')} subtitle={t('botConfigurationHint')} icon={<Bot size={18}/>}/>
      <label className="field"><span>{t('botName')}</span><input value={config?.botName ?? ''} disabled={!config} onChange={(event) => config && setConfig({ ...config, botName: event.target.value })}/></label>
      <div className="field-row">
        <label className="field"><span>{t('prefix')}</span><input value={config?.prefix ?? ''} disabled={!config} onChange={(event) => config && setConfig({ ...config, prefix: event.target.value })}/></label>
        <label className="field"><span>{t('runtimeLanguage')}</span><select value={config?.language ?? 'es'} disabled={!config} onChange={(event) => config && setConfig({ ...config, language: event.target.value as 'es' | 'en' })}><option value="es">Español</option><option value="en">English</option></select></label>
      </div>
      <button className="primary" disabled={!config || busy} onClick={onSave}><Save size={16}/>{t('save')}</button>
    </section>

    <section className="panel-surface section-card settings-card">
      <SectionHeader title={t('interface')} subtitle={t('interfaceHint')} icon={<Languages size={18}/>}/>
      <div className="language-selector">
        <button className={locale === 'es' ? 'language-option active' : 'language-option'} onClick={() => setLocale('es')}><span>ES</span><div><strong>Español</strong><small>{t('interfaceSpanish')}</small></div></button>
        <button className={locale === 'en' ? 'language-option active' : 'language-option'} onClick={() => setLocale('en')}><span>EN</span><div><strong>English</strong><small>{t('interfaceEnglish')}</small></div></button>
      </div>
    </section>

    <section className="panel-surface section-card settings-card system-card">
      <SectionHeader title={t('runtimeCapabilities')} subtitle={t('runtimeCapabilitiesHint')} icon={<ShieldCheck size={18}/>}/>
      <CapabilityRow label={t('webPanel')} value={config ? (config.webEnabled ? t('enabled') : t('disabled')) : '—'}/>
      <CapabilityRow label={t('ollama')} value={config ? (config.ollamaRequested ? config.ollamaModel || t('enabled') : t('disabled')) : '—'}/>
      <CapabilityRow label={t('publicUrl')} value={config?.publicWebUrl || '—'}/>
    </section>
  </div>
}

function ConnectionGate({ connection, busy, onConnection, onConnect, onSettings, t }: {
  connection: ConnectionProfile
  busy: boolean
  onConnection: (profile: ConnectionProfile) => void
  onConnect: () => void
  onSettings: () => void
  t: ReturnType<typeof makeTranslator>
}) {
  return <section className="connection-gate panel-surface">
    <div className="gate-icon"><Server size={28}/></div>
    <div className="gate-copy"><span>{t('connectionRequired')}</span><h2>{t('connectManager')}</h2><p>{t('connectManagerHint')}</p></div>
    <div className="gate-form">
      <label className="field"><span>{t('url')}</span><input value={connection.baseUrl} onChange={(event) => onConnection({ ...connection, baseUrl: event.target.value })}/></label>
      <label className="field"><span>{t('token')}</span><input type="password" autoComplete="off" value={connection.token} onChange={(event) => onConnection({ ...connection, token: event.target.value })}/></label>
      <button className="primary" disabled={busy} onClick={onConnect}><Wifi size={16}/>{t('connect')}</button>
      <button className="text-button" onClick={onSettings}>{t('advancedSettings')}<ChevronRight size={15}/></button>
    </div>
  </section>
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? 'nav-button active' : 'nav-button'} onClick={onClick}>{icon}<span>{label}</span></button>
}

function MetricCard({ icon, label, value, hint, progress }: { icon: ReactNode; label: string; value: string; hint: string; progress?: number }) {
  return <article className="metric-card panel-surface">
    <div className="metric-card-icon">{icon}</div>
    <div className="metric-card-copy"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>
    {typeof progress === 'number' && <div className="metric-progress"><span style={{ width: `${progress}%` }}/></div>}
  </article>
}

function SectionHeader({ title, subtitle, action, icon }: { title: string; subtitle: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="section-header"><div className="section-title-row">{icon && <span className="section-icon">{icon}</span>}<div><h2>{title}</h2><p>{subtitle}</p></div></div>{action}</div>
}

function PlatformGlyph({ id }: { id: 'whatsapp' | 'telegram' | 'discord' }) {
  const icon = id === 'whatsapp' ? <MessageCircle/> : id === 'telegram' ? <Wifi/> : <Network/>
  return <span className={`platform-glyph platform-${id}`}>{icon}</span>
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return <div className="summary-stat"><span>{label}</span><strong>{value}</strong></div>
}

function CapabilityRow({ label, value }: { label: string; value: string }) {
  return <div className="capability-row"><span>{label}</span><strong>{value}</strong></div>
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><CircleDot size={18}/><span>{text}</span></div>
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  return `${(bytes / 1048576).toFixed(bytes > 104857600 ? 0 : 1)} MB`
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0))
  const days = Math.floor(safe / 86400)
  const hours = Math.floor((safe % 86400) / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function platformLabel(id: 'whatsapp' | 'telegram' | 'discord') {
  return id === 'whatsapp' ? 'WhatsApp' : id === 'telegram' ? 'Telegram' : 'Discord'
}

function friendlyError(error: string, t: ReturnType<typeof makeTranslator>) {
  if (error.includes('missing_token') || error.includes('invalid_token')) return t('tokenRequired')
  if (error.includes('https_required_for_remote_control')) return t('httpsRequired')
  if (error.includes('control_api_unreachable')) return t('managerUnreachable')
  return error
}
