import { ArrowDownRight, ArrowRightLeft, ArrowUpRight, CircleAlert, Coins, Filter, ReceiptText, WalletCards } from 'lucide-react'
import type { WebLocale } from '../lib/i18n'
import type { EconomyLedgerSnapshot } from '../lib/economy-ledger'
import { opsExtraT } from '../lib/ops-extra-i18n'

function fmt(value: number, locale: WebLocale) {
  return value.toLocaleString(locale === 'en' ? 'en-US' : 'es-MX')
}

function formatDate(value: number, locale: WebLocale) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function compact(value: string, max = 30) {
  return value.length <= max ? value : `${value.slice(0, Math.floor(max / 2))}…${value.slice(-Math.floor(max / 2))}`
}

function instanceLabel(role: string | null, id: number | null, main: string, unknown: string) {
  if (role === 'main') return main
  if (role === 'subbot' && id) return `Subbot #${id}`
  return unknown
}

export function EconomyLedgerDashboard({
  snapshot,
  instanceKey,
  instanceLabel: selectedInstanceLabel,
  locale,
  filters,
}: {
  snapshot: EconomyLedgerSnapshot
  instanceKey: string
  instanceLabel: string
  locale: WebLocale
  filters: { user: string; kind: string; source: string; days: number }
}) {
  const t = (key: Parameters<typeof opsExtraT>[1]) => opsExtraT(locale, key)
  const total = snapshot.totals
  const amountClass = (amount: number) => amount > 0 ? 'text-emerald-300' : amount < 0 ? 'text-red-300' : 'text-blue-300'

  return <div className="space-y-5">
    <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><Coins className="size-5 text-blue-400"/><h2 className="text-lg font-black text-white">{t('ledger.title')}</h2></div>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-zinc-500">{t('ledger.subtitle')} · {selectedInstanceLabel}</p>
        </div>
        <span className={snapshot.totals.unattributed ? 'ops-badge-warn' : 'ops-badge-good'}>
          <CircleAlert className="mr-1.5 size-3"/>{t('ledger.unattributed')}: {fmt(snapshot.totals.unattributed, locale)}
        </span>
      </div>

      <form method="get" action="/admin" className="grid gap-2 p-5 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_.75fr_auto]">
        <input type="hidden" name="section" value="economy"/>
        <input type="hidden" name="instance" value={instanceKey}/>
        <input className="ops-input" name="ledgerUser" defaultValue={filters.user} placeholder={t('ledger.userPlaceholder')} maxLength={160}/>
        <select className="ops-input" name="ledgerKind" defaultValue={filters.kind}>
          <option value="">{t('ledger.all')} · {t('ledger.type')}</option>
          {snapshot.kinds.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="ops-input" name="ledgerSource" defaultValue={filters.source}>
          <option value="">{t('ledger.all')} · {t('ledger.source')}</option>
          {snapshot.sources.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="ops-input" name="ledgerDays" defaultValue={String(filters.days)}>
          <option value="1">{t('ledger.day1')}</option>
          <option value="7">{t('ledger.day7')}</option>
          <option value="30">{t('ledger.day30')}</option>
          <option value="90">{t('ledger.day90')}</option>
        </select>
        <button className="ops-button-primary"><Filter className="size-4"/>{t('ledger.filter')}</button>
      </form>
    </section>

    {!snapshot.available ? <section className="ops-panel p-6">
      <div className="flex items-start gap-3"><CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-400"/><p className="text-sm leading-6 text-zinc-400">{t('ledger.unavailable')}</p></div>
    </section> : <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          [ReceiptText, t('ledger.transactions'), total.transactions, 'text-blue-400'],
          [ArrowUpRight, t('ledger.credits'), total.credits, 'text-emerald-400'],
          [ArrowDownRight, t('ledger.debits'), total.debits, 'text-red-400'],
          [ArrowRightLeft, t('ledger.net'), total.net, total.net >= 0 ? 'text-emerald-400' : 'text-red-400'],
          [CircleAlert, t('ledger.unattributed'), total.unattributed, total.unattributed ? 'text-amber-400' : 'text-emerald-400'],
        ].map(([Icon, label, value, color]) => {
          const I = Icon as typeof ReceiptText
          return <article key={String(label)} className="ops-stat"><I className={`size-4 ${String(color)}`}/><p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-zinc-600">{String(label)}</p><p className="mt-1 text-xl font-black text-white">{fmt(Number(value), locale)}</p></article>
        })}
      </section>

      <section className="ops-panel overflow-hidden">
        {snapshot.rows.length ? <div className="overflow-x-auto">
          <table className="ops-table min-w-[1180px]">
            <thead><tr>
              <th>{t('ledger.date')}</th>
              <th>{t('ledger.user')}</th>
              <th>{t('ledger.type')}</th>
              <th>{t('ledger.source')}</th>
              <th>{t('ledger.amount')}</th>
              <th>{t('ledger.balance')}</th>
              <th>{t('ledger.instance')}</th>
              <th>{t('ledger.transaction')}</th>
            </tr></thead>
            <tbody>{snapshot.rows.map((row) => <tr key={row.transactionId}>
              <td className="whitespace-nowrap text-xs text-zinc-500">{formatDate(row.createdAt, locale)}</td>
              <td>
                <p className="max-w-52 truncate text-sm font-semibold text-zinc-200">{row.displayName || row.userJid.split('@')[0]}</p>
                <p className="max-w-52 truncate font-mono text-[10px] text-zinc-600">{row.userJid}</p>
                {row.counterpartyJid ? <p className="mt-1 max-w-52 truncate text-[10px] text-zinc-600">{t('ledger.counterparty')}: {row.counterpartyJid}</p> : null}
              </td>
              <td>
                <p className="font-mono text-xs font-bold text-zinc-200">{row.kind}</p>
                {row.note ? <p className="mt-1 max-w-56 truncate text-[10px] text-zinc-600" title={row.note}>{row.note}</p> : null}
              </td>
              <td>
                <span className={row.attributed ? 'ops-badge-good' : 'ops-badge-warn'}>{row.attributed ? t('ledger.attributed') : t('ledger.fallback')}</span>
                <p className="mt-1 font-mono text-[10px] text-zinc-600">{row.source}</p>
              </td>
              <td>
                <p className={`font-mono text-sm font-black ${amountClass(row.amount)}`}>{row.amount > 0 ? '+' : ''}{fmt(row.amount, locale)} NXC</p>
                <p className="mt-1 text-[10px] text-zinc-600">{t('ledger.wallet')}: {row.walletDelta > 0 ? '+' : ''}{fmt(row.walletDelta, locale)} · {t('ledger.bank')}: {row.bankDelta > 0 ? '+' : ''}{fmt(row.bankDelta, locale)}</p>
              </td>
              <td>
                <p className="font-mono text-xs text-zinc-300">{row.balanceBefore === null ? '—' : fmt(row.balanceBefore, locale)} → {fmt(row.balanceAfter, locale)}</p>
                <p className="mt-1 text-[10px] text-zinc-600">{t('ledger.wallet')}: {row.walletBefore === null ? '—' : fmt(row.walletBefore, locale)} → {fmt(row.walletAfter, locale)}</p>
                <p className="text-[10px] text-zinc-600">{t('ledger.bank')}: {row.bankBefore === null ? '—' : fmt(row.bankBefore, locale)} → {fmt(row.bankAfter, locale)}</p>
              </td>
              <td><span className="ops-badge">{instanceLabel(row.instanceRole, row.instanceId, t('ledger.main'), t('ledger.unknownInstance'))}</span></td>
              <td><code className="font-mono text-[10px] text-zinc-600" title={row.transactionId}>{compact(row.transactionId, 24)}</code></td>
            </tr>)}</tbody>
          </table>
        </div> : <div className="grid min-h-40 place-items-center p-8 text-center"><div><WalletCards className="mx-auto size-7 text-zinc-700"/><p className="mt-3 text-sm text-zinc-600">{t('ledger.empty')}</p></div></div>}
      </section>

      {snapshot.totals.unattributed ? <section className="rounded-xl border border-amber-500/15 bg-amber-500/[.05] px-4 py-3">
        <p className="text-xs leading-5 text-amber-200/80">{t('ledger.fallbackText')}</p>
      </section> : null}
    </>}
  </div>
}
