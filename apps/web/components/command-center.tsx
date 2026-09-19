'use client'

import { Activity, CheckCircle2, CircleOff, Layers3, Save, Search, Settings2, SquareTerminal, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { OpsCommand, OpsCommandCategory } from '../lib/ops'
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

function permissionLabels(command: OpsCommand, t: (key: Parameters<typeof webT>[1]) => string) {
  const labels: string[] = []
  if (command.permissions.ownerOnly) labels.push(t('commands.metadataPermissionOwner'))
  if (command.permissions.staffOnly) labels.push(t('commands.metadataPermissionStaff'))
  if (command.permissions.subbotOwnerAllowed) labels.push(t('commands.metadataPermissionSubbotOwner'))
  if (command.permissions.groupOnly) labels.push(t('commands.metadataPermissionGroup'))
  if (command.permissions.adminOnly) labels.push(t('commands.metadataPermissionGroupAdmin'))
  if (command.permissions.botAdminOnly) labels.push(t('commands.metadataPermissionBotAdmin'))
  return labels
}

function PlatformState({
  available,
  enabled,
  label,
  yes,
  no,
  configuredOff,
}: {
  available: boolean
  enabled: boolean
  label: string
  yes: string
  no: string
  configuredOff: string
}) {
  const state = !available ? no : enabled ? yes : configuredOff
  const title = `${label}: ${state}`
  return <span
    className={!available ? 'inline-flex items-center gap-1.5 text-zinc-700' : enabled ? 'inline-flex items-center gap-1.5 text-emerald-300' : 'inline-flex items-center gap-1.5 text-amber-400'}
    title={title}
    aria-label={title}
  >
    {!available ? <XCircle className="size-4"/> : enabled ? <CheckCircle2 className="size-4"/> : <CircleOff className="size-4"/>}
    <span className="text-[10px] font-bold uppercase tracking-wide">{state}</span>
  </span>
}

function booleanOptions(t: (key: Parameters<typeof webT>[1]) => string) {
  return <>
    <option value="1">{t('commands.yes')}</option>
    <option value="0">{t('commands.no')}</option>
  </>
}

export function CommandCenter({
  commands,
  categories,
  locale,
  instanceLabel,
  instanceKey,
  csrfToken,
  canManage,
  canManageOwnerCommands,
}: {
  commands: OpsCommand[]
  categories: OpsCommandCategory[]
  locale: WebLocale
  instanceLabel: string
  instanceKey: string
  csrfToken: string
  canManage: boolean
  canManageOwnerCommands: boolean
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [parity, setParity] = useState<ParityFilter>('all')
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const intl = webIntlLocale(locale)
  const t = (key: Parameters<typeof webT>[1]) => webT(locale, key)

  const categoryNames = useMemo(
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

  const selected = selectedName ? commands.find((command) => command.commandName === selectedName) ?? null : null
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

    <section className="ops-panel p-5">
      <div className="flex items-center gap-2">
        <Layers3 className="size-4 text-blue-400"/>
        <h3 className="font-bold text-white">{t('commands.categoriesTitle')}</h3>
      </div>
      <p className="mt-1 text-xs text-zinc-500">{t('commands.categoriesText')}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {categories.map((item) => {
          const locked = !canManage || (item.category === 'owner' && !canManageOwnerCommands)
          return <form key={item.category} method="post" action="/api/control">
            <input type="hidden" name="_csrf" value={csrfToken}/>
            <input type="hidden" name="section" value="commands"/>
            <input type="hidden" name="instance" value={instanceKey}/>
            <input type="hidden" name="action" value="set_command_category"/>
            <input type="hidden" name="category" value={item.category}/>
            <input type="hidden" name="enabled" value={item.enabled ? '0' : '1'}/>
            <button
              type="submit"
              disabled={locked}
              className={item.enabled ? 'ops-button-muted text-xs' : 'ops-button-danger text-xs'}
              title={locked ? t('commands.readOnly') : undefined}
            >
              {item.enabled ? <CheckCircle2 className="size-3.5"/> : <CircleOff className="size-3.5"/>}
              {item.category}
            </button>
          </form>
        })}
      </div>
    </section>

    {selected && <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-white/[.07] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-blue-500">{t('commands.editorEyebrow')}</p>
          <h3 className="mt-1 font-mono text-lg font-black text-white">.{selected.commandName}</h3>
          <p className="mt-1 max-w-3xl text-xs text-zinc-500">{selected.description}</p>
          <div className="mt-3 flex max-w-4xl flex-wrap gap-1.5 text-[10px] font-semibold text-zinc-500">
            {selected.usage && <span className="ops-pill">{t('commands.metadataUsage')}: {selected.usage}</span>}
            {selected.aliases.map((alias) => <span key={`alias:${alias}`} className="ops-pill">{t('commands.metadataAlias')}: {alias}</span>)}
            {selected.arguments.map((argument) => <span key={`arg:${argument.name}`} className="ops-pill">
              {argument.required ? '<' : '['}{argument.name}{argument.variadic ? '...' : ''}{argument.required ? '>' : ']'}
            </span>)}
            {permissionLabels(selected, t).map((permission) => <span key={`permission:${permission}`} className="ops-pill">{permission}</span>)}
            {selected.capabilities.map((capability) => <span key={`capability:${capability}`} className="ops-pill">{t('commands.metadataCapability')}: {capability}</span>)}
          </div>
        </div>
        <button type="button" className="ops-button-muted text-xs" onClick={() => setSelectedName(null)}>{t('common.close')}</button>
      </div>

      <form key={selected.commandName} method="post" action="/api/control" className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
        <input type="hidden" name="_csrf" value={csrfToken}/>
        <input type="hidden" name="section" value="commands"/>
        <input type="hidden" name="instance" value={instanceKey}/>
        <input type="hidden" name="action" value="save_command_config"/>
        <input type="hidden" name="commandName" value={selected.commandName}/>

        <label className="text-xs font-semibold text-zinc-400">
          {t('commands.enabled')}
          <select name="enabled" className="ops-input mt-2" defaultValue={selected.enabled ? '1' : '0'} disabled={!canManage}>
            {booleanOptions(t)}
          </select>
        </label>

        <label className="text-xs font-semibold text-zinc-400">
          WhatsApp
          <select name="whatsapp" className="ops-input mt-2" defaultValue={selected.whatsappEnabled ? '1' : '0'} disabled={!canManage || !selected.whatsapp}>
            {booleanOptions(t)}
          </select>
        </label>

        <label className="text-xs font-semibold text-zinc-400">
          Discord
          <select name="discord" className="ops-input mt-2" defaultValue={selected.discordEnabled ? '1' : '0'} disabled={!canManage || !selected.discord}>
            {booleanOptions(t)}
          </select>
        </label>

        <label className="text-xs font-semibold text-zinc-400">
          Telegram
          <select name="telegram" className="ops-input mt-2" defaultValue={selected.telegramEnabled ? '1' : '0'} disabled={!canManage || !selected.telegram}>
            {booleanOptions(t)}
          </select>
        </label>

        <label className="text-xs font-semibold text-zinc-400">
          {t('commands.cooldown')}
          <input name="cooldownMs" type="number" min="0" max="86400000" step="1000" className="ops-input mt-2" defaultValue={selected.cooldownMs} disabled={!canManage}/>
          <span className="mt-1 block text-[10px] font-normal text-zinc-700">{t('commands.cooldownHelp')}</span>
        </label>

        <label className="text-xs font-semibold text-zinc-400">
          {t('commands.groups')}
          <select name="allowGroups" className="ops-input mt-2" defaultValue={selected.allowGroups ? '1' : '0'} disabled={!canManage}>
            {booleanOptions(t)}
          </select>
        </label>

        <label className="text-xs font-semibold text-zinc-400">
          {t('commands.private')}
          <select name="allowPrivate" className="ops-input mt-2" defaultValue={selected.allowPrivate ? '1' : '0'} disabled={!canManage}>
            {booleanOptions(t)}
          </select>
        </label>

        <label className="text-xs font-semibold text-zinc-400">
          {t('commands.permission')}
          {selected.category === 'adult' ? <input type="hidden" name="permissionMode" value="inherit"/> : null}
          <select name={selected.category === 'adult' ? undefined : 'permissionMode'} className="ops-input mt-2" defaultValue={selected.category === 'adult' ? 'inherit' : selected.permissionMode} disabled={!canManage || selected.category === 'adult'}>
            <option value="inherit">{t('commands.permissionInherit')}</option>
            <option value="staff">{t('commands.permissionStaff')}</option>
            <option value="owner">{t('commands.permissionOwner')}</option>
          </select>
          <span className="mt-1 block text-[10px] font-normal text-zinc-700">{selected.category === 'adult' ? t('commands.permissionAdultHelp') : t('commands.permissionHelp')}</span>
        </label>

        <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-4">
          <button type="submit" className="ops-button-primary" disabled={!canManage || (selected.category === 'owner' && !canManageOwnerCommands)}>
            <Save className="size-4"/>{t('commands.save')}
          </button>
          {!canManage && <span className="text-xs text-zinc-600">{t('commands.readOnly')}</span>}
        </div>
      </form>

      {canManage && (selected.category !== 'owner' || canManageOwnerCommands) && <form method="post" action="/api/control" className="border-t border-white/[.07] px-5 py-4">
        <input type="hidden" name="_csrf" value={csrfToken}/>
        <input type="hidden" name="section" value="commands"/>
        <input type="hidden" name="instance" value={instanceKey}/>
        <input type="hidden" name="action" value="reset_command_config"/>
        <input type="hidden" name="commandName" value={selected.commandName}/>
        <button type="submit" className="ops-button-muted text-xs">{t('commands.reset')}</button>
      </form>}
    </section>}

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
          {categoryNames.map((item) => <option key={item} value={item}>{item}</option>)}
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
        <table className="ops-table min-w-[1320px]">
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
              <th>{t('commands.config')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((command) => <tr key={command.commandName} className={!command.enabled || !command.categoryEnabled ? 'bg-red-500/[.025]' : fullParity(command) ? undefined : 'bg-amber-500/[.015]'}>
              <td>
                <div className="font-mono font-bold text-blue-400">.{command.commandName}</div>
                <div className="mt-1 max-w-sm truncate text-[11px] text-zinc-600" title={command.description}>{command.description}</div>
              </td>
              <td><span className="inline-flex rounded-md border border-white/[.08] bg-white/[.03] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{command.category}</span></td>
              <td><PlatformState available={command.whatsapp} enabled={command.whatsappEnabled} label="WhatsApp" yes={t('commands.yes')} no={t('commands.no')} configuredOff={t('commands.off')}/></td>
              <td><PlatformState available={command.discord} enabled={command.discordEnabled} label="Discord" yes={t('commands.yes')} no={t('commands.no')} configuredOff={t('commands.off')}/></td>
              <td><PlatformState available={command.telegram} enabled={command.telegramEnabled} label="Telegram" yes={t('commands.yes')} no={t('commands.no')} configuredOff={t('commands.off')}/></td>
              <td className="font-mono">{command.invocations.toLocaleString(intl)}</td>
              <td><span className={command.successRate >= 99 ? 'ops-badge-good' : command.successRate >= 95 ? 'ops-badge-warn' : 'ops-badge-bad'}>{command.successRate.toFixed(command.invocations ? 1 : 0)}%</span></td>
              <td className="font-mono font-semibold">{latency(command.avgUs, intl)}</td>
              <td>
                <div className="flex flex-col items-start gap-1.5">
                  <span className={command.status === 'optimal' ? 'ops-badge-good' : command.status === 'warning' ? 'ops-badge-warn' : 'ops-badge-bad'}>{statusLabels[command.status]}</span>
                  {!command.enabled || !command.categoryEnabled
                    ? <span className="text-[10px] font-bold uppercase tracking-wide text-red-400/80">{t('commands.disabled')}</span>
                    : !fullParity(command) && <span className="text-[10px] font-bold uppercase tracking-wide text-amber-400/80">{t('commands.parityPending')}</span>}
                </div>
              </td>
              <td>
                <button type="button" className="ops-button-muted text-xs" onClick={() => setSelectedName(command.commandName)}>
                  <Settings2 className="size-3.5"/>{canManage ? t('commands.edit') : t('commands.view')}
                </button>
              </td>
            </tr>) : <tr><td colSpan={10} className="py-12 text-center text-sm text-zinc-600">{t('commands.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div>
}
