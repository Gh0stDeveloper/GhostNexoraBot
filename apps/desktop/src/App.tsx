import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity, Bot, CheckCircle2, CircleDot, Cpu, Download, Folder, Gauge, HardDrive, Languages,
  LayoutDashboard, Link2, Network, PackageCheck, Play, Power, QrCode, RefreshCw, RotateCw,
  Save, Search, Server, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Square, Terminal,
  Unplug, Wrench, Wifi, WifiOff,
} from 'lucide-react'
import type {
  ConfigResponse, LogEntry, LogsResponse, PairStatusResponse, RuntimeAction,
  RuntimeMetricsResponse, RuntimeStatusResponse,
} from '@ghostnexora/control-api-contracts'
import { control, type ConnectionProfile } from './control'
import { makeTranslator, type Locale } from './i18n'
import { linuxRuntime, type LinuxRuntimeAction, type LinuxRuntimeProbe } from './linuxRuntime'

type View = 'overview' | 'platforms' | 'pairing' | 'activity' | 'settings'
type LogLevelFilter = 'all' | LogEntry['level']

const savedBaseUrl = window.localStorage.getItem('ghostnexora.manager.baseUrl') || 'http://127.0.0.1:3002'
const savedLocale = (window.localStorage.getItem('ghostnexora.manager.locale') === 'en' ? 'en' : 'es') as Locale
const remoteInitial: ConnectionProfile = { baseUrl: savedBaseUrl, token: '' }

export default function App() {
  const [locale, setLocale] = useState<Locale>(savedLocale)
  const t = useMemo(() => makeTranslator(locale), [locale])
  const [view, setView] = useState<View>('overview')
  const [platform, setPlatform] = useState('unknown')
  const [remoteMode, setRemoteMode] = useState(false)
  const [remoteConnection, setRemoteConnection] = useState<ConnectionProfile>(remoteInitial)
  const [connection, setConnection] = useState<ConnectionProfile>(remoteInitial)
  const [localProbe, setLocalProbe] = useState<LinuxRuntimeProbe | null>(null)
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState<RuntimeStatusResponse | null>(null)
  const [metrics, setMetrics] = useState<RuntimeMetricsResponse | null>(null)
  const [logs, setLogs] = useState<LogsResponse | null>(null)
  const [config, setConfig] = useState<ConfigResponse['config'] | null>(null)
  const [pair, setPair] = useState<PairStatusResponse | null>(null)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [localBusy, setLocalBusy] = useState(false)
  const [error, setError] = useState('')
  const [logQuery, setLogQuery] = useState('')
  const [logLevel, setLogLevel] = useState<LogLevelFilter>('all')

  const localMode = platform === 'linux' && !remoteMode

  useEffect(() => { window.localStorage.setItem('ghostnexora.manager.locale', locale) }, [locale])
  useEffect(() => { window.localStorage.setItem('ghostnexora.manager.baseUrl', remoteConnection.baseUrl) }, [remoteConnection.baseUrl])

  useEffect(() => {
    void linuxRuntime.platform().then(async (value) => {
      setPlatform(value)
      if (value === 'linux') {
        setRemoteMode(false)
        await probeLocal(true)
      } else {
        setRemoteMode(true)
        setConnection(remoteInitial)
      }
    }).catch(() => {
      setPlatform('unknown')
      setRemoteMode(true)
    })
  }, [])

  async function refresh(profile = connection, silent = false) {
    if (!silent) setBusy(true)
    setError('')
    try {
      const s = await control.status(profile)
      setStatus(s); setConnected(true)
      const [m, l, c] = await Promise.allSettled([control.metrics(profile), control.logs(profile), control.config(profile)])
      if (m.status === 'fulfilled') setMetrics(m.value)
      if (l.status === 'fulfilled') setLogs(l.value)
      if (c.status === 'fulfilled') setConfig(c.value.config)
    } catch (e) {
      setConnected(false); setStatus(null); setMetrics(null); setLogs(null); setConfig(null)
      if (!silent) setError(e instanceof Error ? e.message : String(e))
    } finally { if (!silent) setBusy(false) }
  }

  async function probeLocal(autoconnect: boolean) {
    try {
      const probe = await linuxRuntime.probe()
      setLocalProbe(probe)
      if (autoconnect && probe.installed && probe.running) {
        const local = await linuxRuntime.connection()
        const profile = { baseUrl: local.baseUrl, token: local.token }
        setConnection(profile)
        await refresh(profile, true)
      } else if (!probe.running) {
        setConnected(false); setStatus(null); setMetrics(null); setLogs(null); setConfig(null)
      }
      return probe
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    }
  }

  useEffect(() => {
    if (!connected) return
    const id = window.setInterval(() => void refresh(connection, true), 8_000)
    return () => window.clearInterval(id)
  }, [connected, connection.baseUrl, connection.token])

  useEffect(() => {
    if (!localMode) return
    const id = window.setInterval(() => void probeLocal(false), 10_000)
    return () => window.clearInterval(id)
  }, [localMode])

  useEffect(() => {
    if (!connected || pair?.state !== 'waiting') return
    const id = window.setInterval(async () => {
      try { setPair(await control.pairStatus(connection)) } catch { /* best effort */ }
    }, 3_000)
    return () => window.clearInterval(id)
  }, [connected, pair?.state, connection.baseUrl, connection.token])

  async function localAction(action: LinuxRuntimeAction) {
    setLocalBusy(true); setError('')
    try {
      const probe = await linuxRuntime.action(action)
      setLocalProbe(probe)
      if (probe.running) {
        const local = await linuxRuntime.connection()
        const profile = { baseUrl: local.baseUrl, token: local.token }
        setConnection(profile)
        await refresh(profile, true)
      } else {
        setConnected(false); setStatus(null); setMetrics(null); setLogs(null); setConfig(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLocalBusy(false) }
  }

  async function runtime(action: RuntimeAction) {
    if (localMode) {
      await localAction(action)
      return
    }
    setBusy(true); setError('')
    try {
      const result = await control.runtime(connection, action)
      if (!result.accepted && result.managerRequired) throw new Error(t('managerRequired'))
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setBusy(false)
    }
  }

  async function platformAction(id: 'whatsapp' | 'telegram' | 'discord', next: boolean) {
    setBusy(true); setError('')
    try { await control.platform(connection, id, next); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }

  async function pairStart(mode: 'qr' | 'code') {
    setBusy(true); setError('')
    try {
      if (localMode && mode === 'code' && phone.trim()) await linuxRuntime.setOwner(phone)
      const result = await control.pairStart(connection, { platform: 'whatsapp', mode, phoneNumber: mode === 'code' ? phone : undefined })
      setPair(result)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  async function saveConfig() {
    if (!config) return
    setBusy(true); setError('')
    try {
      const result = await control.patchConfig(connection, { botName: config.botName, prefix: config.prefix, language: config.language })
      setConfig(result.config); await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }

  async function useLocalMode() {
    setRemoteMode(false); setView('overview'); setPair(null); setError('')
    await probeLocal(true)
  }

  function useRemoteMode() {
    setRemoteMode(true); setConnection(remoteConnection); setConnected(false)
    setStatus(null); setMetrics(null); setLogs(null); setConfig(null); setPair(null); setView('settings'); setError('')
  }

  async function connectRemote() {
    setConnection(remoteConnection)
    await refresh(remoteConnection)
  }

  const runtimeOffline = localMode ? !localProbe?.running : status?.runtime.state === 'offline'
  const runtimeOnline = localMode ? Boolean(localProbe?.running) : status?.runtime.state === 'online'
  const heapPercent = metrics?.memory.heapTotalBytes ? Math.min(100, Math.round((metrics.memory.heapUsedBytes / metrics.memory.heapTotalBytes) * 100)) : 0
  const connectedPlatforms = status?.platforms.filter((item) => item.connected).length ?? 0
  const filteredLogs = useMemo(() => {
    const query = logQuery.trim().toLowerCase()
    return (logs?.entries ?? []).filter((entry) => (logLevel === 'all' || entry.level === logLevel) && (!query || entry.message.toLowerCase().includes(query)))
  }, [logs, logLevel, logQuery])

  const pageTitle = view === 'overview' ? t('overview') : view === 'platforms' ? t('platforms') : view === 'pairing' ? t('pairing') : view === 'activity' ? t('activity') : t('settings')
  const pageSubtitle = view === 'overview' ? t('overviewSubtitle') : view === 'platforms' ? t('platformsSubtitle') : view === 'pairing' ? t('pairingSubtitle') : view === 'activity' ? t('activitySubtitle') : t('settingsSubtitle')

  return <div className="desktop-shell">
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-mark"><Sparkles size={19}/></div><div><strong>Ghost Nexora</strong><span>{localMode ? t('localMode') : 'Manager V2'}</span></div></div>
      <nav className="nav-list" aria-label={t('navigation')}>
        <Nav active={view === 'overview'} icon={<LayoutDashboard/>} label={t('overview')} onClick={() => setView('overview')}/>
        <Nav active={view === 'platforms'} icon={<Network/>} label={t('platforms')} onClick={() => setView('platforms')}/>
        <Nav active={view === 'pairing'} icon={<QrCode/>} label={t('pairingShort')} onClick={() => setView('pairing')}/>
        <Nav active={view === 'activity'} icon={<Terminal/>} label={t('activity')} onClick={() => setView('activity')}/>
        <Nav active={view === 'settings'} icon={<Settings/>} label={t('settings')} onClick={() => setView('settings')}/>
      </nav>
      <div className="sidebar-spacer"/>
      <div className={`connection-summary ${(localMode ? localProbe?.running : connected) ? 'is-online' : ''}`}>
        <span className="status-dot"/><div><strong>{localMode ? (localProbe?.running ? t('localReady') : t('localStopped')) : (connected ? t('managerOnline') : t('managerOffline'))}</strong><small>{localMode ? localProbe?.serviceMode ?? 'Linux' : connection.baseUrl}</small></div>
      </div>
      <div className="sidebar-actions">
        <button className="sidebar-icon-button" onClick={() => setLocale(locale === 'es' ? 'en' : 'es')}><Languages size={17}/><span>{locale.toUpperCase()}</span></button>
        <button className="sidebar-icon-button" disabled={busy || localBusy} onClick={() => localMode ? void probeLocal(true) : void refresh()}><RefreshCw size={17} className={(busy || localBusy) ? 'spin' : ''}/></button>
      </div>
    </aside>

    <main className="workspace">
      <header className="workspace-header"><div><p className="eyebrow">NEXORA CONTROL CENTER · {localMode ? 'LINUX LOCAL' : 'REMOTE'}</p><h1>{pageTitle}</h1><p>{pageSubtitle}</p></div>
        <span className={`runtime-pill ${(localMode ? localProbe?.running : connected) ? 'online' : ''}`}><CircleDot size={14}/>{localMode ? (localProbe?.running ? t('online') : t('offline')) : (connected ? t('online') : t('offline'))}</span>
      </header>

      {error && <div className="alert error-alert"><WifiOff size={17}/><div><strong>{t('actionFailed')}</strong><span>{friendlyError(error, t)}</span></div></div>}

      {localMode && !localProbe?.installed && view !== 'settings' && <LinuxInstall probe={localProbe} busy={localBusy} onInstall={() => void localAction('install')} t={t}/>} 

      {view === 'overview' && (!localMode || localProbe?.installed) && <Overview status={status} metrics={metrics} logs={logs} busy={busy || localBusy} runtimeOffline={runtimeOffline} runtimeOnline={runtimeOnline} heapPercent={heapPercent} connectedPlatforms={connectedPlatforms} runtime={runtime} localProbe={localMode ? localProbe : null} t={t}/>} 

      {view === 'platforms' && (connected ? <Platforms status={status} busy={busy} runtimeOffline={runtimeOffline} onAction={platformAction} t={t}/> : <RuntimeGate localMode={localMode} onStart={() => void runtime('start')} t={t}/>)}
      {view === 'pairing' && (connected ? <Pairing pair={pair} phone={phone} setPhone={setPhone} busy={busy} runtimeOffline={runtimeOffline} onPair={pairStart} t={t}/> : <RuntimeGate localMode={localMode} onStart={() => void runtime('start')} t={t}/>)}
      {view === 'activity' && (connected ? <ActivityView entries={filteredLogs} query={logQuery} setQuery={setLogQuery} level={logLevel} setLevel={setLogLevel} t={t}/> : <RuntimeGate localMode={localMode} onStart={() => void runtime('start')} t={t}/>)}
      {view === 'settings' && <SettingsView localMode={localMode} platform={platform} probe={localProbe} localBusy={localBusy} remote={remoteConnection} setRemote={setRemoteConnection} connected={connected} config={config} setConfig={setConfig} locale={locale} setLocale={setLocale} onConnectRemote={() => void connectRemote()} onUseRemote={useRemoteMode} onUseLocal={() => void useLocalMode()} onSave={() => void saveConfig()} onLocalAction={(a) => void localAction(a)} t={t}/>} 
    </main>
  </div>
}

function LinuxInstall({ probe, busy, onInstall, t }: { probe: LinuxRuntimeProbe | null; busy: boolean; onInstall: () => void; t: ReturnType<typeof makeTranslator> }) {
  const steps = [t('installStepSystem'), t('installStepNode'), t('installStepRepo'), t('installStepBuild'), t('installStepService')]
  return <section className="install-hero panel-surface"><div className="install-icon"><Download size={28}/></div><div className="install-copy"><span className="mode-badge">LINUX · LOCAL FIRST</span><h2>{t('installLocalTitle')}</h2><p>{t('installLocalHint')}</p><div className="install-steps">{steps.map((step) => <div key={step}><CheckCircle2 size={16}/><span>{step}</span></div>)}</div><p className="security-note"><ShieldCheck size={16}/>{t('systemAuthHint')}</p></div><div className="install-action"><button className="primary action-large" disabled={busy} onClick={onInstall}><PackageCheck size={18}/>{busy ? t('installBusy') : t('installLocal')}</button>{probe?.missingDependencies.length ? <small>{t('missingDeps')}: {probe.missingDependencies.join(', ')}</small> : <small>{t('allDepsReady')}</small>}</div></section>
}

function Overview({ status, metrics, logs, busy, runtimeOffline, runtimeOnline, heapPercent, connectedPlatforms, runtime, localProbe, t }: {
  status: RuntimeStatusResponse | null; metrics: RuntimeMetricsResponse | null; logs: LogsResponse | null; busy: boolean; runtimeOffline: boolean | undefined; runtimeOnline: boolean; heapPercent: number; connectedPlatforms: number; runtime: (action: RuntimeAction) => Promise<void>; localProbe: LinuxRuntimeProbe | null; t: ReturnType<typeof makeTranslator>
}) {
  return <div className="page-stack"><section className="runtime-hero panel-surface"><div className="hero-copy"><div className="hero-status-row"><span className={`live-indicator ${runtimeOnline ? 'online' : ''}`}><span/>{runtimeOnline ? t('operational') : t('offline')}</span>{localProbe && <span className="profile-chip">{localProbe.serviceMode}</span>}</div><h2>{status?.runtime.botName || 'Ghost Nexora Bot'}</h2><p>{t('runtimeHeroHint')}</p><div className="runtime-meta"><span><SlidersHorizontal size={15}/>{t('prefix')}: <b>{status?.runtime.prefix ?? '—'}</b></span><span><Cpu size={15}/>PID: <b>{metrics?.process.pid ?? '—'}</b></span>{localProbe && <span><Link2 size={15}/>{localProbe.currentSha || localProbe.sourceRef}</span>}</div></div><div className="hero-actions"><button className="primary" disabled={busy || !runtimeOffline} onClick={() => void runtime('start')}><Play size={16}/>{t('start')}</button><button className="secondary" disabled={busy || runtimeOffline} onClick={() => void runtime('stop')}><Square size={15}/>{t('stop')}</button><button className="secondary" disabled={busy || runtimeOffline} onClick={() => void runtime('restart')}><RotateCw size={15}/>{t('restart')}</button><button className="secondary" disabled={busy} onClick={() => void runtime('update')}><RefreshCw size={15}/>{t('update')}</button></div></section>
    <section className="metrics-row"><Metric icon={<Gauge/>} label={t('uptime')} value={formatDuration(status?.runtime.uptimeSeconds ?? 0)}/><Metric icon={<Server/>} label={t('memory')} value={metrics ? formatBytes(metrics.memory.rssBytes) : '—'} hint={`${heapPercent}% ${t('heapUsed')}`}/><Metric icon={<Network/>} label={t('platforms')} value={`${connectedPlatforms}/${status?.platforms.length ?? 0}`}/><Metric icon={<Bot/>} label={t('subbots')} value={`${status?.subbots.online ?? 0}/${status?.subbots.total ?? 0}`}/></section>
    {localProbe && <section className="panel-surface local-strip"><div><HardDrive size={18}/><span><small>{t('sourceRef')}</small><strong>{localProbe.sourceRef}</strong></span></div><div><PackageCheck size={18}/><span><small>{t('nodeRuntime')}</small><strong>{localProbe.nodeVersion || '—'}</strong></span></div><div><Power size={18}/><span><small>{t('localWeb')}</small><strong>{localProbe.webEnabled ? t('enabled') : t('disabled')}</strong></span></div></section>}
    <section className="overview-grid"><article className="panel-surface section-card"><SectionTitle icon={<Network/>} title={t('platforms')}/><div className="platform-list">{status?.platforms.map((item) => <div className="platform-row" key={item.id}><div><strong>{capitalize(item.id)}</strong><small>{item.accountLabel || item.state}</small></div><span className={`badge ${item.connected ? 'online' : ''}`}>{item.connected ? t('online') : t('offline')}</span></div>) ?? <p className="muted">{t('noData')}</p>}</div></article><article className="panel-surface section-card"><SectionTitle icon={<Activity/>} title={t('recentActivity')}/><div className="mini-log">{logs?.entries.slice(-7).map((entry) => <div key={entry.cursor}><span className={`level ${entry.level}`}>{entry.level}</span><p>{entry.message}</p></div>) ?? <p className="muted">{t('noData')}</p>}</div></article></section>
  </div>
}

function Platforms({ status, busy, runtimeOffline, onAction, t }: { status: RuntimeStatusResponse | null; busy: boolean; runtimeOffline: boolean | undefined; onAction: (id: 'whatsapp' | 'telegram' | 'discord', next: boolean) => Promise<void>; t: ReturnType<typeof makeTranslator> }) {
  return <section className="cards-grid">{status?.platforms.map((item) => <article className="panel-surface platform-card" key={item.id}><div className="platform-head"><div className="platform-icon"><Network size={20}/></div><span className={`badge ${item.connected ? 'online' : ''}`}>{item.connected ? t('online') : t('offline')}</span></div><h3>{capitalize(item.id)}</h3><p>{item.accountLabel || item.detail || t('platformReady')}</p><button className="secondary" disabled={busy || runtimeOffline || (!item.enabled && !item.connected)} onClick={() => void onAction(item.id, !item.connected)}>{item.connected ? <Unplug size={15}/> : <Wifi size={15}/>} {item.connected ? t('disconnect') : t('connect')}</button></article>)}</section>
}

function Pairing({ pair, phone, setPhone, busy, runtimeOffline, onPair, t }: { pair: PairStatusResponse | null; phone: string; setPhone: (v: string) => void; busy: boolean; runtimeOffline: boolean | undefined; onPair: (mode: 'qr' | 'code') => Promise<void>; t: ReturnType<typeof makeTranslator> }) {
  return <section className="pair-layout"><article className="panel-surface section-card"><SectionTitle icon={<QrCode/>} title={t('linkWhatsApp')}/><p className="muted">{t('pairingLongHint')}</p><label><span>{t('phone')}</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+52 664 000 0000"/></label><div className="actions"><button className="primary" disabled={busy || runtimeOffline} onClick={() => void onPair('code')}>{t('pairCode')}</button><button className="secondary" disabled={busy || runtimeOffline} onClick={() => void onPair('qr')}>{t('pairQr')}</button></div></article><article className="panel-surface pair-result-card"><span className={`badge ${pair?.state === 'paired' ? 'online' : ''}`}>{pair?.state ?? t('idle')}</span>{pair?.pairingCode && <code className="pair-code">{pair.pairingCode}</code>}{pair?.qr && <textarea className="qr-payload" readOnly value={pair.qr}/>}<p>{pair?.detail || t('waitingForPairHint')}</p>{pair?.expiresAt && <small>{t('expires')}: {new Date(pair.expiresAt).toLocaleTimeString()}</small>}</article></section>
}

function ActivityView({ entries, query, setQuery, level, setLevel, t }: { entries: LogEntry[]; query: string; setQuery: (v: string) => void; level: LogLevelFilter; setLevel: (v: LogLevelFilter) => void; t: ReturnType<typeof makeTranslator> }) {
  return <section className="panel-surface activity-panel"><div className="filters"><label className="search-box"><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchLogs')}/></label><select value={level} onChange={(e) => setLevel(e.target.value as LogLevelFilter)}><option value="all">ALL</option><option value="info">INFO</option><option value="warn">WARN</option><option value="error">ERROR</option><option value="debug">DEBUG</option></select></div><div className="log-console">{entries.length ? entries.map((entry) => <div key={entry.cursor}><time>{new Date(entry.timestamp).toLocaleTimeString()}</time><span className={`level ${entry.level}`}>{entry.level}</span><p>{entry.message}</p></div>) : <p className="muted">{t('noLogsMatch')}</p>}</div></section>
}

function RuntimeGate({ localMode, onStart, t }: { localMode: boolean; onStart: () => void; t: ReturnType<typeof makeTranslator> }) {
  return <section className="panel-surface empty-gate"><Power size={30}/><h2>{t('connectionRequired')}</h2><p>{localMode ? t('runtimeMustBeOnline') : t('connectManagerHint')}</p>{localMode && <button className="primary" onClick={onStart}><Play size={16}/>{t('start')}</button>}</section>
}

function SettingsView({ localMode, platform, probe, localBusy, remote, setRemote, connected, config, setConfig, locale, setLocale, onConnectRemote, onUseRemote, onUseLocal, onSave, onLocalAction, t }: {
  localMode: boolean; platform: string; probe: LinuxRuntimeProbe | null; localBusy: boolean; remote: ConnectionProfile; setRemote: (v: ConnectionProfile) => void; connected: boolean; config: ConfigResponse['config'] | null; setConfig: (v: ConfigResponse['config'] | null) => void; locale: Locale; setLocale: (v: Locale) => void; onConnectRemote: () => void; onUseRemote: () => void; onUseLocal: () => void; onSave: () => void; onLocalAction: (a: LinuxRuntimeAction) => void; t: ReturnType<typeof makeTranslator>
}) {
  return <div className="settings-grid">{platform === 'linux' && <article className="panel-surface section-card wide"><SectionTitle icon={<Server/>} title={t('localRuntime')}/><p className="muted">{t('localRuntimeHint')}</p>{probe?.installed ? <><div className="runtime-facts"><Fact label={t('state')} value={probe.running ? t('online') : t('offline')}/><Fact label={t('sourceRef')} value={probe.sourceRef}/><Fact label={t('codeVersion')} value={probe.currentSha || '—'}/><Fact label={t('serviceMode')} value={probe.serviceMode}/><Fact label={t('nodeRuntime')} value={probe.nodeVersion || '—'}/><Fact label={t('npmRuntime')} value={probe.npmVersion || '—'}/></div><div className="actions"><button className="secondary" disabled={localBusy} onClick={() => onLocalAction('repair')}><Wrench size={15}/>{t('repair')}</button><button className="secondary" disabled={localBusy} onClick={() => onLocalAction(probe.webEnabled ? 'web-off' : 'web-on')}><Power size={15}/>{probe.webEnabled ? t('disableWeb') : t('enableWeb')}</button>{!localMode && <button className="primary" onClick={onUseLocal}>{t('switchLocal')}</button>}</div><div className="path-list"><PathRow icon={<Folder/>} label={t('repoPath')} value={probe.paths.repo}/><PathRow icon={<HardDrive/>} label={t('dataPath')} value={probe.paths.data}/><PathRow icon={<ShieldCheck/>} label={t('sessionPath')} value={probe.paths.session}/><PathRow icon={<Download/>} label={t('downloadsPath')} value={probe.paths.downloads}/></div><p className="security-note"><ShieldCheck size={16}/>{t('localWebHint')}</p></> : <button className="primary" disabled={localBusy} onClick={() => onLocalAction('install')}><PackageCheck size={16}/>{t('installLocal')}</button>}<div className="mode-switch"><button className={localMode ? 'active' : ''} onClick={onUseLocal}>{t('localMode')}</button><button className={!localMode ? 'active' : ''} onClick={onUseRemote}>{t('remoteMode')}</button></div></article>}
    {!localMode && <article className="panel-surface section-card"><SectionTitle icon={<Wifi/>} title={t('managerConnection')}/><p className="muted">{t('remoteOptional')}</p><label><span>{t('url')}</span><input value={remote.baseUrl} onChange={(e) => setRemote({ ...remote, baseUrl: e.target.value })}/></label><label><span>{t('token')}</span><input type="password" autoComplete="off" value={remote.token} onChange={(e) => setRemote({ ...remote, token: e.target.value })}/></label><button className="primary" onClick={onConnectRemote}><Wifi size={16}/>{connected ? t('reconnect') : t('connect')}</button><p className="security-note"><ShieldCheck size={16}/>{t('remoteNotice')}</p></article>}
    <article className="panel-surface section-card"><SectionTitle icon={<Languages/>} title={t('interface')}/><label><span>{t('language')}</span><select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}><option value="es">Español</option><option value="en">English</option></select></label></article>
    <article className="panel-surface section-card"><SectionTitle icon={<Bot/>} title={t('botConfiguration')}/>{config ? <><label><span>{t('botName')}</span><input value={config.botName} onChange={(e) => setConfig({ ...config, botName: e.target.value })}/></label><label><span>{t('prefix')}</span><input value={config.prefix} onChange={(e) => setConfig({ ...config, prefix: e.target.value })}/></label><label><span>{t('runtimeLanguage')}</span><select value={config.language} onChange={(e) => setConfig({ ...config, language: e.target.value as 'es' | 'en' })}><option value="es">Español</option><option value="en">English</option></select></label><button className="primary" onClick={onSave}><Save size={16}/>{t('save')}</button></> : <p className="muted">{t('connectionRequired')}</p>}</article>
  </div>
}

function Nav({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) { return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button> }
function Metric({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) { return <article className="metric-card panel-surface"><div className="metric-icon">{icon}</div><div><small>{label}</small><strong>{value}</strong>{hint && <span>{hint}</span>}</div></article> }
function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) { return <div className="section-title"><div>{icon}<h2>{title}</h2></div></div> }
function Fact({ label, value }: { label: string; value: string }) { return <div className="fact"><small>{label}</small><strong>{value}</strong></div> }
function PathRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="path-row">{icon}<span><small>{label}</small><code>{value}</code></span></div> }
function capitalize(value: string) { return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value }
function formatDuration(seconds: number) { if (!seconds) return '0m'; const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m` }
function formatBytes(bytes: number) { return `${(bytes / 1048576).toFixed(1)} MB` }
function friendlyError(error: string, t: ReturnType<typeof makeTranslator>) { if (error.includes('missing_token') || error.includes('invalid_token')) return t('tokenRequired'); if (error.includes('https_required')) return t('httpsRequired'); if (error.includes('control_api_unreachable')) return t('managerUnreachable'); return error }
