'use client'

import { Activity, CheckCircle2, Layers3, Search, SquareTerminal, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { OpsCommand } from '../lib/ops'
import { webIntlLocale, webT, type WebLocale } from '../lib/i18n'

type ParityFilter = 'all' | 'full' | 'missing' | 'discord' | 'telegram'

function latency(us: number, intl: string) {
  if (!us) return '0 ms'
  if (us >= 1_000_000) return `${(us / 1_000_000).toFixed(2)} s`
  if (us >= 1_000) return `${(us / 1_000).toFixed(2)} ms`
  return `${Math.max(0, Math.round(us / 100) / 10).toLocaleString(intl)} ms`
}

function fullParity(command: OpsCommand) {
  return command.whatsapp && command.discord && command.telegram
}

function PlatformState({ enabled, label, yes, no }: { enabled: boolean; label: string; yes: string; no: string }) {
  const title = `${label}: ${enabled ? yes : no}`
  return <span
    className={enabled ? 'inline-flex items-center gap-1.5 text-emerald-300' : 'inline-flex items-center gap-1.5 text-zinc-700'}
    title={title}
    aria-label={title}
  >
    {enabled ? <CheckCircle2 className="size-4"/> : <XCircle className="size-4"/>}
    <span className="text-[10px] font-bold uppercase tracking-wide">{enabled ? yes : no}</span>
  </span>
}

export function CommandCenter({ commands, locale, instanceLabel }: {
  commands: OpsCommand[]
  locale: WebLocale
  instanceLabel: string
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [parity, setParity] = useState<ParityFilter>('all')
  const intl = webIntlLocale(locale)
  const t = (key: Parameters<typeof webT>[1]) => webT(locale, key)

  const categories = useMemo(
    () => [...new Set(commands.map((command) => command.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [commands],
  )

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return commands
      .filter((command) => {
        if (category !== 'all' && command.category !== category) return false
        if (parity === 'full' && !fullParity(command)) return false
        if (parity === 'missing' && fullParity(command)) return false
        if (parity === 'discord' && !command.discord) return false
        if (parity === 'telegram' && !command.telegram) return false
        if (!normalized) return true
        return [command.commandName, command.category, command.description, command.status]
          .some((value) => value.toLowerCase().includes(normalized))
      })
      .sort((a, b) => Number(fullParity(a)) - Number(fullParity(b)) || a.commandName.localeCompare(b.commandName))
  }, [commands, category, parity, query])

  const full = commands.filter(fullParity).length
  const whatsapp = commands.filter((command) => command.whatsapp).length
  const discord = commands.filter((command) => command.discord).length
  const telegram = commands.filter((command) => command.telegram).length

  const statusLabels: Record<OpsCommand['status'], string> = {
    optimal: t('audit.optimal'),
    warning: t('audit.warning'),
    slow: t('audit.slow'),
    critical: t('audit.critical'),
  }

  return <div className="space-y-6">
    <section className="ops-panel p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]">
          <SquareTerminal className="size-5 text-blue-400"/>
        </span>
        <div>
          <h2 className="font-black text-white">{t('commands.title')}</h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-zinc-500">{t('commands.subtitle')}</p>
          <p className="mt-1 font-mono text-[11px] text-zinc-700">{instanceLabel}</p>
        </div>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[
        [Layers3, t('commands.summary.total'), commands.length],
        [CheckCircle2, t('commands.summary.parity'), full],
        [Activity, 'WhatsApp', whatsapp],
        [Activity, 'Discord', discord],
        [Activity, 'Telegram', telegram],
      ].map(([Icon, label, value]) => {
        const I = Icon as typeof Activity
        return <article key={String(label)} className="ops-stat">
          <I className="size-4 text-blue-400"/>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-600">{String(label)}</p>
          <p className="mt-2 text-2xl font-black text-white">{Number(value).toLocaleString(intl)}</p>
        </article>
      })}
    </section>

    <section className="ops-panel overflow-hidden">
      <div className="grid gap-3 border-b border-white/[.07] p-5 md:grid-cols-[minmax(0,1fr)_220px_220px]">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600"/>
          <input
            className="ops-input pl-10"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('commands.search')}
          />
        </label>
        <select className="ops-input" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">{t('commands.categoryAll')}</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="ops-input" value={parity} onChange={(event) => setParity(event.target.value as ParityFilter)}>
          <option value="all">{t('commands.parityAll')}</option>
          <option value="full">{t('commands.parityFull')}</option>
          <option value="missing">{t('commands.parityMissing')}</option>
          <option value="discord">{t('commands.discordAvailable')}</option>
          <option value="telegram">{t('commands.telegramAvailable')}</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="ops-table min-w-[1180px]">
          <thead>
            <tr>
              <th>{t('commands.command')}</th>
              <th>{t('commands.category')}</th>
              <th>WhatsApp</th>
              <th>Discord</th>
              <th>Telegram</th>
              <th>{t('commands.invocations')}</th>
              <th>{t('commands.success')}</th>
              <th>{t('commands.latency')}</th>
              <th>{t('commands.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((command) => <tr key={command.commandName} className={fullParity(command) ? undefined : 'bg-amber-500/[.015]'}>
              <td>
                <div className="font-mono font-bold text-blue-400">.{command.commandName}</div>
                <div className="mt-1 max-w-sm truncate text-[11px] text-zinc-600" title={command.description}>{command.description}</div>
              </td>
              <td><span className="inline-flex rounded-md border border-white/[.08] bg-white/[.03] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{command.category}</span></td>
              <td><PlatformState enabled={command.whatsapp} label="WhatsApp" yes={t('commands.yes')} no={t('commands.no')}/></td>
              <td><PlatformState enabled={command.discord} label="Discord" yes={t('commands.yes')} no={t('commands.no')}/></td>
              <td><PlatformState enabled={command.telegram} label="Telegram" yes={t('commands.yes')} no={t('commands.no')}/></td>
              <td className="font-mono">{command.invocations.toLocaleString(intl)}</td>
              <td><span className={command.successRate >= 99 ? 'ops-badge-good' : command.successRate >= 95 ? 'ops-badge-warn' : 'ops-badge-bad'}>{command.successRate.toFixed(command.invocations ? 1 : 0)}%</span></td>
              <td className="font-mono font-semibold">{latency(command.avgUs, intl)}</td>
              <td>
                <div className="flex flex-col items-start gap-1.5">
                  <span className={command.status === 'optimal' ? 'ops-badge-good' : command.status === 'warning' ? 'ops-badge-warn' : 'ops-badge-bad'}>{statusLabels[command.status]}</span>
                  {!fullParity(command) && <span className="text-[10px] font-bold uppercase tracking-wide text-amber-400/80">{t('commands.parityPending')}</span>}
                </div>
              </td>
            </tr>) : <tr><td colSpan={9} className="py-12 text-center text-sm text-zinc-600">{t('commands.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div>
}
