import { useEffect, useMemo, useState } from 'react'
import { Activity, Bot, CircleDot, Languages, RefreshCw, Save, Server, ShieldCheck, Terminal, Unplug, Wifi } from 'lucide-react'
import type { ConfigResponse, LogsResponse, PairStatusResponse, RuntimeMetricsResponse, RuntimeStatusResponse } from '@ghostnexora/control-api-contracts'
import { control, type ConnectionProfile } from './control'
import { makeTranslator, type Locale } from './i18n'

const initial: ConnectionProfile = { baseUrl: 'http://127.0.0.1:3001', token: '' }

export default function App() {
  const [locale, setLocale] = useState<Locale>('es')
  const t = useMemo(() => makeTranslator(locale), [locale])
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

  async function refresh(profile = connection) {
    setBusy(true); setError('')
    try {
      const [s, m, l, c] = await Promise.all([control.status(profile), control.metrics(profile), control.logs(profile), control.config(profile)])
      setStatus(s); setMetrics(m); setLogs(l); setConfig(c.config); setConnected(true)
    } catch (e) {
      setConnected(false); setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  useEffect(() => {
    if (!connected) return
    const id = window.setInterval(() => void refresh(), 10_000)
    return () => window.clearInterval(id)
  }, [connected, connection.baseUrl, connection.token])

  async function platform(id: 'whatsapp' | 'telegram' | 'discord', next: boolean) {
    setBusy(true); setError('')
    try { await control.platform(connection, id, next); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }

  async function pairStart(mode: 'qr' | 'code') {
    setBusy(true); setError('')
    try {
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

  return <main className="app-shell">
    <header className="topbar">
      <div><p className="eyebrow">NEXORA / V2</p><h1>{t('title')}</h1><p>{t('subtitle')}</p></div>
      <button className="icon-button" onClick={() => setLocale(locale === 'es' ? 'en' : 'es')} title={t('language')}><Languages size={18}/><span>{locale.toUpperCase()}</span></button>
    </header>

    <section className="connection-card glass">
      <label><span>{t('url')}</span><input value={connection.baseUrl} onChange={(e) => setConnection({ ...connection, baseUrl: e.target.value })}/></label>
      <label><span>{t('token')}</span><input type="password" autoComplete="off" value={connection.token} onChange={(e) => setConnection({ ...connection, token: e.target.value })}/></label>
      <button className="primary" disabled={busy} onClick={() => void refresh()}><Wifi size={17}/>{t('connect')}</button>
      <p className="notice"><ShieldCheck size={15}/>{t('remoteNotice')}</p>
      {error && <p className="error">{error}</p>}
    </section>

    <section className="grid metrics-grid">
      <Metric icon={<CircleDot/>} label={t('status')} value={status?.runtime.state ?? t('offline')}/>
      <Metric icon={<Activity/>} label={t('uptime')} value={status ? `${Math.floor(status.runtime.uptimeSeconds / 60)} min` : '—'}/>
      <Metric icon={<Server/>} label={t('memory')} value={metrics ? `${(metrics.memory.rssBytes / 1048576).toFixed(1)} MB` : '—'}/>
      <Metric icon={<Bot/>} label={t('subbots')} value={status ? `${status.subbots.online}/${status.subbots.total}` : '—'}/>
    </section>

    <section className="grid two-column">
      <article className="glass panel"><div className="panel-title"><h2>{t('platforms')}</h2><button className="icon-button" onClick={() => void refresh()}><RefreshCw size={16}/></button></div>
        <div className="platform-list">{status?.platforms.map((item) => <div className="platform-row" key={item.id}>
          <div><strong>{item.id[0]?.toUpperCase()}{item.id.slice(1)}</strong><small>{item.accountLabel || item.state}</small></div>
          <span className={item.connected ? 'badge online' : 'badge'}>{item.connected ? t('online') : t('offline')}</span>
          <button className="secondary" disabled={busy || (!item.enabled && !item.connected)} onClick={() => void platform(item.id, !item.connected)}>{item.connected ? <Unplug size={15}/> : <Wifi size={15}/>} {item.connected ? t('disconnect') : t('connect')}</button>
        </div>) ?? <p>{t('noData')}</p>}</div>
      </article>

      <article className="glass panel"><div className="panel-title"><h2>{t('pairing')}</h2></div>
        <label><span>{t('phone')}</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+52 55 1234 5678"/></label>
        <div className="actions"><button className="secondary" onClick={() => void pairStart('qr')}>{t('pairQr')}</button><button className="secondary" onClick={() => void pairStart('code')}>{t('pairCode')}</button></div>
        {pair && <div className="pair-result"><strong>{pair.state}</strong>{pair.pairingCode && <code>{pair.pairingCode}</code>}{pair.qr && <textarea readOnly value={pair.qr}/>}<small>{pair.detail}</small></div>}
      </article>
    </section>

    <section className="grid two-column">
      <article className="glass panel"><div className="panel-title"><h2>{t('settings')}</h2><Save size={17}/></div>
        <label><span>{t('botName')}</span><input value={config?.botName ?? ''} onChange={(e) => config && setConfig({ ...config, botName: e.target.value })}/></label>
        <label><span>{t('prefix')}</span><input value={config?.prefix ?? ''} onChange={(e) => config && setConfig({ ...config, prefix: e.target.value })}/></label>
        <label><span>{t('language')}</span><select value={config?.language ?? 'es'} onChange={(e) => config && setConfig({ ...config, language: e.target.value as 'es' | 'en' })}><option value="es">Español</option><option value="en">English</option></select></label>
        <button className="primary" disabled={!config || busy} onClick={() => void saveConfig()}><Save size={16}/>{t('save')}</button>
        <button className="secondary danger-space" disabled={!connected || busy} onClick={async () => { setBusy(true); try { await control.update(connection); setError('') } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) } }}><RefreshCw size={16}/>{t('update')}</button>
      </article>

      <article className="glass panel terminal"><div className="panel-title"><h2>{t('logs')}</h2><Terminal size={17}/></div>
        <div className="log-list">{logs?.entries.length ? logs.entries.map((entry) => <div key={entry.cursor}><time>{new Date(entry.timestamp).toLocaleTimeString()}</time><span className={`level ${entry.level}`}>{entry.level}</span><p>{entry.message}</p></div>) : <p>{t('noData')}</p>}</div>
      </article>
    </section>
  </main>
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <article className="metric glass"><div className="metric-icon">{icon}</div><div><small>{label}</small><strong>{value}</strong></div></article>
}
