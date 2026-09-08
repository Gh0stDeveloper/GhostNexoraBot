'use client'

import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { OpsCommand } from '../lib/ops'

function latency(us: number) {
  if (!us) return '0 µs'
  if (us >= 1_000_000) return `${(us / 1_000_000).toFixed(2)} s`
  if (us >= 1_000) return `${(us / 1_000).toFixed(2)} ms`
  return `${Math.round(us).toLocaleString('es-MX')} µs`
}

const labels: Record<OpsCommand['status'], string> = {
  optimal: 'ÓPTIMO', warning: 'ATENCIÓN', slow: 'LENTO', critical: 'CRÍTICO',
}

export function CommandAuditTable({ commands }: { commands: OpsCommand[] }) {
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLowerCase()
  const rows = useMemo(() => commands.filter((command) => !normalized || [command.commandName, command.category, command.description, command.status]
    .some((value) => value.toLowerCase().includes(normalized))), [commands, normalized])

  return <section className="ops-panel overflow-hidden">
    <div className="flex flex-col gap-4 border-b border-white/[.08] px-5 py-5 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-base font-bold text-white">Benchmark y Profiling de Plugins en Tiempo Real</h2>
        <p className="mt-1 text-xs text-zinc-500">Todos los comandos registrados, incluidos los que todavía no han sido invocados.</p>
      </div>
      <label className="relative block w-full md:max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="ops-input pl-10" placeholder="Filtrar por comando, categoría o estado..." />
      </label>
    </div>
    <div className="overflow-x-auto">
      <table className="ops-table min-w-[1050px]">
        <thead><tr><th>Comando / plugin</th><th>Invocaciones</th><th>Tasa de éxito</th><th>Latencia mínima</th><th>Latencia media</th><th>Pico máximo</th><th>Delta heap RAM</th><th>Estado térmico</th></tr></thead>
        <tbody>
          {rows.length ? rows.map((command) => <tr key={command.commandName}>
            <td><div className="font-mono font-bold text-blue-400">.{command.commandName}</div><div className="mt-1 max-w-xs truncate text-[11px] text-zinc-600">{command.category} · {command.description}</div></td>
            <td className="font-mono">{command.invocations.toLocaleString('es-MX')}</td>
            <td><span className={command.successRate >= 99 ? 'ops-badge-good' : command.successRate >= 95 ? 'ops-badge-warn' : 'ops-badge-bad'}>{command.successRate.toFixed(command.invocations ? 1 : 0)}%</span></td>
            <td className="font-mono">{latency(command.minUs)}</td>
            <td className="font-mono font-semibold">{latency(command.avgUs)}</td>
            <td className={`font-mono ${command.maxUs >= 1_000_000 ? 'text-red-400' : ''}`}>{latency(command.maxUs)}</td>
            <td className={`font-mono ${command.heapDeltaKb > 0 ? 'text-zinc-300' : 'text-zinc-500'}`}>{command.heapDeltaKb > 0 ? '+' : ''}{command.heapDeltaKb.toLocaleString('es-MX')} KB</td>
            <td><span className={command.status === 'optimal' ? 'ops-badge-good' : command.status === 'warning' ? 'ops-badge-warn' : 'ops-badge-bad'}>{labels[command.status]}</span></td>
          </tr>) : <tr><td colSpan={8} className="py-10 text-center text-zinc-500">No hay comandos que coincidan con el filtro.</td></tr>}
        </tbody>
      </table>
    </div>
  </section>
}
