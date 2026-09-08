import { Activity, Gauge, GitBranch, RefreshCcw, RotateCcw, ServerCog, ShieldAlert, UsersRound } from 'lucide-react'
import type { OpsSnapshot } from '../lib/ops'
import { CommandAuditTable } from './command-audit-table'
import { ConfirmSubmitButton, OpsAutoRefresh } from './ops-client-controls'

function latency(us: number) {
  if (!us) return '0 µs'
  if (us >= 1_000_000) return `${(us / 1_000_000).toFixed(2)} s`
  if (us >= 1_000) return `${(us / 1_000).toFixed(2)} ms`
  return `${Math.round(us).toLocaleString('es-MX')} µs`
}

function relativeTime(timestamp: number) {
  if (!timestamp) return 'Sin datos'
  const diff = Math.max(0, Date.now() - timestamp)
  if (diff < 60_000) return `hace ${Math.max(1, Math.round(diff / 1000))} s`
  if (diff < 3_600_000) return `hace ${Math.round(diff / 60_000)} min`
  if (diff < 86_400_000) return `hace ${Math.round(diff / 3_600_000)} h`
  return `hace ${Math.round(diff / 86_400_000)} d`
}

export function OpsConsole({ snapshot, refreshHref, instanceLabel }: { snapshot: OpsSnapshot; refreshHref: string; instanceLabel: string }) {
  const stats = [
    { icon: Activity, label: 'Throughput del Pipeline', value: `${snapshot.summary.throughputMps.toFixed(2)} MPS`, note: 'Mensajes por segundo' },
    { icon: Gauge, label: 'Latencia E2E Promedio', value: latency(snapshot.summary.averageE2eUs), note: `${snapshot.summary.averageE2eUs.toLocaleString('es-MX')} µs tiempo total instrumentado` },
    { icon: GitBranch, label: 'Nodos de Procesamiento', value: `${snapshot.summary.processingNodes} / 7`, note: 'Etapas instrumentadas' },
    { icon: ServerCog, label: 'Plugins Auditados', value: snapshot.summary.auditedCommands.toLocaleString('es-MX'), note: 'Comandos registrados' },
    { icon: ShieldAlert, label: 'Cuellos de Botella', value: snapshot.summary.bottlenecks.toLocaleString('es-MX'), note: 'Comandos lentos o críticos', danger: snapshot.summary.bottlenecks > 0 },
  ]

  return <div className="space-y-6">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {stats.map(({ icon: Icon, label, value, note, danger }) => <article key={label} className="ops-stat">
        <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-zinc-500">{label}</p><Icon className="size-4 text-zinc-700" /></div>
        <p className={`mt-3 text-2xl font-black tracking-tight ${danger ? 'text-red-400' : 'text-white'}`}>{value}</p>
        <p className="mt-1 text-xs text-zinc-600">{note}</p>
      </article>)}
    </section>

    <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] px-5 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4"><GitBranch className="size-5 shrink-0 text-blue-400"/><div><h2 className="font-bold text-white">Mapa Neuronal y Topología del Pipeline (DAG)</h2><p className="mt-1 text-xs text-zinc-500">{instanceLabel} · flujo de procesamiento medido en microsegundos</p></div></div>
        <div className="flex flex-wrap gap-2">
          <OpsAutoRefresh seconds={10}/>
          <form action="/api/control" method="post"><input type="hidden" name="action" value="reset_audit"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><button className="ops-button-muted"><RotateCcw className="size-4"/>Reset</button></form>
          <a href={refreshHref} className="ops-button-muted"><RefreshCcw className="size-4"/>Actualizar</a>
        </div>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
        {snapshot.stages.map((stage) => <article key={stage.id} className="ops-node">
          <div className="flex items-center justify-between gap-3"><span className="font-mono text-xs font-bold tracking-wider text-blue-500">ETAPA {stage.id}</span><span className={stage.status === 'optimal' ? 'ops-badge-good' : 'ops-badge-bad'}>{stage.status === 'optimal' ? 'ÓPTIMO' : 'CUELLO DE BOTELLA'}</span></div>
          <h3 className="mt-4 font-bold text-zinc-100">{stage.name}</h3>
          <p className="mt-3 font-mono text-2xl font-black text-white">{stage.avgUs.toLocaleString('es-MX')} <span className="text-sm font-normal text-zinc-600">µs ({(stage.avgUs / 1000).toFixed(3)} ms)</span></p>
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-zinc-600"><span>Último: {stage.lastUs.toLocaleString('es-MX')} µs</span><span>{stage.invocations.toLocaleString('es-MX')} ejecuciones</span></div>
        </article>)}
      </div>
    </section>

    <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] px-5 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3"><UsersRound className="size-5 text-blue-400"/><div><h2 className="font-bold text-white">Grupos conectados</h2><p className="mt-1 text-xs text-zinc-500">{snapshot.groups.length} grupo(s) registrados en {instanceLabel}. El panel nunca usa datos de otro subbot.</p></div></div>
        <form action="/api/control" method="post"><input type="hidden" name="action" value="sync_groups"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><button className="ops-button-muted"><RefreshCcw className="size-4"/>Sincronizar grupos</button></form>
      </div>
      <div className="overflow-x-auto">
        <table className="ops-table min-w-[820px]">
          <thead><tr><th>Grupo</th><th>Miembros</th><th>Admins</th><th>Modo</th><th>Actualizado</th><th className="text-right">Acción</th></tr></thead>
          <tbody>
            {snapshot.groups.length ? snapshot.groups.map((group) => <tr key={group.groupJid}>
              <td><p className="font-semibold text-zinc-100">{group.name}</p><p className="mt-1 font-mono text-[10px] text-zinc-700">{group.groupJid}</p></td>
              <td className="font-mono">{group.participantCount.toLocaleString('es-MX')}</td>
              <td className="font-mono">{group.adminCount.toLocaleString('es-MX')}</td>
              <td><span className={group.announce ? 'ops-badge-warn' : 'ops-badge-good'}>{group.announce ? 'SOLO ADMINS' : 'ABIERTO'}</span></td>
              <td className="text-zinc-500">{relativeTime(group.updatedAt)}</td>
              <td className="text-right"><form action="/api/control" method="post"><input type="hidden" name="action" value="leave_group"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><input type="hidden" name="groupJid" value={group.groupJid}/><ConfirmSubmitButton className="ops-button-danger" confirmText={`¿Seguro que quieres que ${instanceLabel} salga de “${group.name}”?`}>Salir del grupo</ConfirmSubmitButton></form></td>
            </tr>) : <tr><td colSpan={6} className="py-10 text-center text-zinc-500">No hay grupos sincronizados para esta instancia. Pulsa “Sincronizar grupos”.</td></tr>}
          </tbody>
        </table>
      </div>
      {snapshot.requests.length > 0 && <div className="border-t border-white/[.08] px-5 py-4 text-xs text-zinc-600">Última operación: {snapshot.requests[0].action} · {snapshot.requests[0].status}{snapshot.requests[0].error ? ` · ${snapshot.requests[0].error}` : ''}</div>}
    </section>

    <CommandAuditTable commands={snapshot.commands} />
  </div>
}
