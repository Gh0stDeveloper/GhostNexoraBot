import { Activity, Gauge, GitBranch, RefreshCcw, RotateCcw, ServerCog, ShieldAlert, Signal, UsersRound } from 'lucide-react'
import type { OpsSnapshot } from '../lib/ops'
import { CommandAuditTable } from './command-audit-table'
import { ConfirmSubmitButton, OpsAutoRefresh } from './ops-client-controls'

export type OpsConsoleView = 'overview' | 'groups' | 'audit'

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

export function OpsConsole({ snapshot, refreshHref, instanceLabel, view = 'overview' }: {
  snapshot: OpsSnapshot
  refreshHref: string
  instanceLabel: string
  view?: OpsConsoleView
}) {
  if (view === 'groups') {
    return <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] px-5 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3"><UsersRound className="size-5 text-blue-400"/><div><h2 className="font-bold text-white">Grupos conectados</h2><p className="mt-1 text-xs text-zinc-500">{snapshot.groups.length} grupo(s) registrados en {instanceLabel}. También se actualizan con tráfico real del grupo.</p></div></div>
        <div className="flex flex-wrap gap-2"><OpsAutoRefresh seconds={10}/><form action="/api/control" method="post"><input type="hidden" name="action" value="sync_groups"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><input type="hidden" name="section" value="groups"/><button className="ops-button-muted"><RefreshCcw className="size-4"/>Sincronizar grupos</button></form></div>
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
              <td className="text-right"><form action="/api/control" method="post"><input type="hidden" name="action" value="leave_group"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><input type="hidden" name="section" value="groups"/><input type="hidden" name="groupJid" value={group.groupJid}/><ConfirmSubmitButton className="ops-button-danger" confirmText={`¿Seguro que quieres que ${instanceLabel} salga de “${group.name}”?`}>Salir</ConfirmSubmitButton></form></td>
            </tr>) : <tr><td colSpan={6} className="py-10 text-center text-zinc-500">No hay grupos sincronizados. Si el bot está conectado, pulsa “Sincronizar grupos”; cualquier grupo con tráfico nuevo también aparecerá automáticamente.</td></tr>}
          </tbody>
        </table>
      </div>
      {snapshot.requests.length > 0 && <div className="border-t border-white/[.08] px-5 py-4 text-xs text-zinc-600">Última operación: {snapshot.requests[0].action} · {snapshot.requests[0].status}{snapshot.requests[0].error ? ` · ${snapshot.requests[0].error}` : ''}</div>}
    </section>
  }

  if (view === 'audit') {
    return <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs text-zinc-500">Auditor aislado de {instanceLabel}. Los comandos lentos se ordenan por coste medio.</p></div>
        <div className="flex gap-2"><OpsAutoRefresh seconds={10}/><form action="/api/control" method="post"><input type="hidden" name="action" value="reset_audit"/><input type="hidden" name="instance" value={snapshot.instanceKey}/><input type="hidden" name="section" value="audit"/><button className="ops-button-muted"><RotateCcw className="size-4"/>Reset auditor</button></form></div>
      </div>
      <CommandAuditTable commands={snapshot.commands} />
    </div>
  }

  const stats = [
    { icon: Signal, label: 'WhatsApp', value: snapshot.runtime.connected ? 'CONECTADO' : snapshot.runtime.registered ? 'SIN HEARTBEAT' : 'NO VINCULADO', note: snapshot.runtime.fresh ? `Heartbeat ${relativeTime(snapshot.runtime.updatedAt)}` : 'Sin heartbeat reciente', danger: !snapshot.runtime.connected },
    { icon: Activity, label: 'Throughput', value: `${snapshot.summary.throughputMps.toFixed(2)} MPS`, note: 'Mensajes por segundo' },
    { icon: Gauge, label: 'Latencia E2E', value: latency(snapshot.summary.averageE2eUs), note: `${snapshot.summary.averageE2eUs.toLocaleString('es-MX')} µs instrumentados` },
    { icon: GitBranch, label: 'Pipeline', value: `${snapshot.summary.processingNodes} / 7`, note: 'Etapas instrumentadas' },
    { icon: ServerCog, label: 'Comandos', value: snapshot.summary.auditedCommands.toLocaleString('es-MX'), note: 'Plugins registrados' },
    { icon: ShieldAlert, label: 'Cuellos de botella', value: snapshot.summary.bottlenecks.toLocaleString('es-MX'), note: 'Lentos o críticos', danger: snapshot.summary.bottlenecks > 0 },
  ]

  return <div className="space-y-6">
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {stats.map(({ icon: Icon, label, value, note, danger }) => <article key={label} className="ops-stat">
        <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-zinc-500">{label}</p><Icon className={`size-4 ${label === 'WhatsApp' && snapshot.runtime.connected ? 'text-emerald-500' : 'text-zinc-700'}`} /></div>
        <p className={`mt-3 text-xl font-black tracking-tight ${danger ? 'text-red-400' : 'text-white'}`}>{value}</p>
        <p className="mt-1 text-xs text-zinc-600">{note}</p>
      </article>)}
    </section>

    <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/[.08] px-5 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4"><GitBranch className="size-5 shrink-0 text-blue-400"/><div><h2 className="font-bold text-white">Topología del Pipeline (DAG)</h2><p className="mt-1 text-xs text-zinc-500">{instanceLabel} · {snapshot.runtime.groupCount} grupo(s) · última sync {relativeTime(snapshot.runtime.lastGroupSyncAt)}</p></div></div>
        <div className="flex flex-wrap gap-2"><OpsAutoRefresh seconds={10}/><a href={refreshHref} className="ops-button-muted"><RefreshCcw className="size-4"/>Actualizar</a></div>
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
  </div>
}
