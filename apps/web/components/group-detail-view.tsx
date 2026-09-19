import {
  ArrowLeft, Bot, CalendarDays, Languages, Lock, Megaphone, MessageSquare,
  Radio, Save, ShieldCheck, Unlock, UserRoundCog, UsersRound, Volume2, VolumeX,
} from 'lucide-react'
import type { GroupDetail } from '../lib/group-detail'
import type { WebLocale } from '../lib/i18n'

function maskedMember(jid: string) {
  const local = jid.split('@')[0] ?? jid
  const digits = local.replace(/\D/g, '')
  if (digits.length >= 8) return `${digits.slice(0, 2)}••••••${digits.slice(-4)}`
  if (local.length > 8) return `${local.slice(0, 3)}••••${local.slice(-3)}`
  return local
}

function formatDate(value: number, locale: WebLocale) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function hiddenFields(instanceKey: string, groupJid: string) {
  return <>
    <input type="hidden" name="instance" value={instanceKey}/>
    <input type="hidden" name="section" value="groups"/>
    <input type="hidden" name="groupJid" value={groupJid}/>
  </>
}

export function GroupDetailView({
  detail,
  locale,
  csrfToken,
  backHref,
  canManage,
  canLeave,
  scopeLabel,
}: {
  detail: GroupDetail
  locale: WebLocale
  csrfToken: string
  backHref: string
  canManage: boolean
  canLeave: boolean
  scopeLabel: string
}) {
  const es = locale !== 'en'
  const intl = es ? 'es-MX' : 'en-US'
  const muted = detail.mutedUntil > Date.now()
  const labels = es ? {
    back: 'Volver a grupos',
    subtitle: 'Vista operativa detallada del grupo',
    members: 'Miembros',
    admins: 'Admins',
    botAdmin: 'Bot admin',
    yes: 'Sí',
    no: 'No',
    unknown: 'Sin datos',
    created: 'Creado',
    updated: 'Actualizado',
    today: 'Mensajes hoy',
    seven: 'Mensajes 7 días',
    thirty: 'Mensajes 30 días',
    active: 'Activos hoy',
    state: 'Estado del grupo',
    everyone: 'Todos pueden escribir',
    adminsOnly: 'Solo admins pueden escribir',
    infoOpen: 'Info editable',
    infoLocked: 'Info bloqueada',
    muted: 'Silenciado',
    notifications: 'Notificaciones activas',
    openGroup: 'Abrir grupo',
    closeGroup: 'Cerrar grupo',
    lockInfo: 'Bloquear info',
    unlockInfo: 'Permitir editar info',
    mute8h: 'Silenciar 8 h',
    mute7d: 'Silenciar 7 días',
    unmute: 'Activar notificaciones',
    config: 'Configuración',
    configText: 'Ajustes persistentes de este grupo en la instancia actual.',
    botEnabled: 'Bot habilitado',
    welcome: 'Bienvenida',
    goodbye: 'Despedida',
    antiLink: 'Anti-link',
    antiSpam: 'Anti-spam',
    adult: 'Modo adulto',
    restricted: 'Modo restringido',
    language: 'Idioma',
    automatic: 'Automático',
    welcomeText: 'Mensaje de bienvenida',
    goodbyeText: 'Mensaje de despedida',
    save: 'Guardar configuración',
    commandPolicy: 'Perfil de comandos',
    adultCategory: 'Categoría adult',
    membersTitle: 'Miembros y administradores',
    membersText: 'Snapshot del último metadata recibido por WhatsApp. Los identificadores se muestran parcialmente ocultos.',
    noMembers: 'Todavía no hay snapshot de participantes. Ejecuta una sincronización de grupos.',
    admin: 'ADMIN',
    superAdmin: 'SUPERADMIN',
    bot: 'BOT',
    broadcast: 'Anuncio al grupo',
    broadcastText: 'Envía un mensaje únicamente a este grupo desde la instancia seleccionada.',
    messagePlaceholder: 'Escribe el anuncio…',
    send: 'Enviar anuncio',
    danger: 'Acciones críticas',
    leave: 'Sacar al bot del grupo',
    leaveText: 'Requiere una sesión reciente. La instancia dejará de participar en este grupo.',
  } : {
    back: 'Back to groups',
    subtitle: 'Detailed operational group view',
    members: 'Members',
    admins: 'Admins',
    botAdmin: 'Bot admin',
    yes: 'Yes',
    no: 'No',
    unknown: 'No data',
    created: 'Created',
    updated: 'Updated',
    today: 'Messages today',
    seven: 'Messages 7 days',
    thirty: 'Messages 30 days',
    active: 'Active today',
    state: 'Group state',
    everyone: 'Everyone can send',
    adminsOnly: 'Admins only can send',
    infoOpen: 'Info editable',
    infoLocked: 'Info locked',
    muted: 'Muted',
    notifications: 'Notifications active',
    openGroup: 'Open group',
    closeGroup: 'Close group',
    lockInfo: 'Lock info',
    unlockInfo: 'Allow info edits',
    mute8h: 'Mute 8 h',
    mute7d: 'Mute 7 days',
    unmute: 'Enable notifications',
    config: 'Configuration',
    configText: 'Persistent settings for this group in the current instance.',
    botEnabled: 'Bot enabled',
    welcome: 'Welcome',
    goodbye: 'Goodbye',
    antiLink: 'Anti-link',
    antiSpam: 'Anti-spam',
    adult: 'Adult mode',
    restricted: 'Restricted mode',
    language: 'Language',
    automatic: 'Automatic',
    welcomeText: 'Welcome message',
    goodbyeText: 'Goodbye message',
    save: 'Save configuration',
    commandPolicy: 'Command profile',
    adultCategory: 'Adult category',
    membersTitle: 'Members and administrators',
    membersText: 'Snapshot from the latest WhatsApp metadata. Identifiers are partially masked.',
    noMembers: 'No participant snapshot yet. Run a group synchronization.',
    admin: 'ADMIN',
    superAdmin: 'SUPERADMIN',
    bot: 'BOT',
    broadcast: 'Group announcement',
    broadcastText: 'Send a message only to this group from the selected instance.',
    messagePlaceholder: 'Write the announcement…',
    send: 'Send announcement',
    danger: 'Critical actions',
    leave: 'Remove bot from group',
    leaveText: 'Requires a recent session. This instance will leave the group.',
  }

  const settingRows: Array<[string, string, boolean]> = [
    ['botEnabled', labels.botEnabled, detail.settings.botEnabled],
    ['welcome', labels.welcome, detail.settings.welcome],
    ['goodbye', labels.goodbye, detail.settings.goodbye],
    ['antiLink', labels.antiLink, detail.settings.antiLink],
    ['antiSpam', labels.antiSpam, detail.settings.antiSpam],
    ['adultAllowed', labels.adult, detail.settings.adultAllowed],
    ['restrictedMode', labels.restricted, detail.settings.restrictedMode],
  ]

  return <div className="mx-auto w-full max-w-[1380px] px-4 py-7 md:px-7 lg:px-9">
    <a href={backHref} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 hover:text-zinc-200">
      <ArrowLeft className="size-4"/>{labels.back}
    </a>

    <section className="ops-panel overflow-hidden">
      <div className="flex flex-col gap-5 p-5 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-4">
          {detail.pictureUrl
            ? <img src={detail.pictureUrl} alt="" className="size-16 shrink-0 rounded-2xl border border-white/[.08] object-cover" referrerPolicy="no-referrer"/>
            : <span className="grid size-16 shrink-0 place-items-center rounded-2xl border border-white/[.08] bg-white/[.03] text-2xl font-black text-zinc-500">{detail.name.slice(0, 1).toUpperCase()}</span>}
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-500">{scopeLabel}</p>
            <h1 className="mt-1 break-words text-2xl font-black tracking-tight text-white">{detail.name}</h1>
            <p className="mt-1 break-all font-mono text-[11px] text-zinc-600">{detail.groupJid}</p>
            <p className="mt-2 text-xs text-zinc-500">{labels.subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className={detail.announce ? 'ops-badge-warn' : 'ops-badge-good'}>{detail.announce ? labels.adminsOnly : labels.everyone}</span>
          <span className={detail.restrictMode ? 'ops-badge-warn' : 'ops-badge-good'}>{detail.restrictMode ? labels.infoLocked : labels.infoOpen}</span>
          <span className={muted ? 'ops-badge-warn' : 'ops-badge-good'}>{muted ? labels.muted : labels.notifications}</span>
        </div>
      </div>
      {detail.description ? <p className="border-t border-white/[.06] px-5 py-4 text-sm leading-6 text-zinc-500">{detail.description}</p> : null}
    </section>

    <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        [UsersRound, labels.members, detail.participantCount],
        [ShieldCheck, labels.admins, detail.adminCount],
        [MessageSquare, labels.today, detail.messagesToday],
        [Radio, labels.active, detail.activeToday],
        [MessageSquare, labels.seven, detail.messages7d],
        [MessageSquare, labels.thirty, detail.messages30d],
      ].map(([Icon, label, value]) => {
        const I = Icon as typeof UsersRound
        return <article key={String(label)} className="ops-stat"><I className="size-4 text-blue-400"/><p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-zinc-600">{String(label)}</p><p className="mt-1 font-mono text-xl font-black text-white">{Number(value).toLocaleString(intl)}</p></article>
      })}
      <article className="ops-stat"><Bot className="size-4 text-blue-400"/><p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-zinc-600">{labels.botAdmin}</p><p className="mt-1 font-bold text-white">{detail.botAdmin === null ? labels.unknown : detail.botAdmin ? labels.yes : labels.no}</p></article>
      <article className="ops-stat"><CalendarDays className="size-4 text-blue-400"/><p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-zinc-600">{labels.updated}</p><p className="mt-1 text-xs font-semibold text-zinc-200">{formatDate(detail.updatedAt, locale)}</p></article>
    </section>

    {canManage ? <section className="mt-5 ops-panel p-5">
      <h2 className="font-bold text-white">{labels.state}</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        <form action="/api/control" method="post"><input type="hidden" name="_csrf" value={csrfToken}/>{hiddenFields(detail.instanceKey, detail.groupJid)}<input type="hidden" name="action" value={detail.announce ? 'group_announce_off' : 'group_announce_on'}/><button className="ops-button-muted">{detail.announce ? <Unlock className="size-4"/> : <Lock className="size-4"/>}{detail.announce ? labels.openGroup : labels.closeGroup}</button></form>
        <form action="/api/control" method="post"><input type="hidden" name="_csrf" value={csrfToken}/>{hiddenFields(detail.instanceKey, detail.groupJid)}<input type="hidden" name="action" value={detail.restrictMode ? 'group_lock_off' : 'group_lock_on'}/><button className="ops-button-muted">{detail.restrictMode ? <Unlock className="size-4"/> : <Lock className="size-4"/>}{detail.restrictMode ? labels.unlockInfo : labels.lockInfo}</button></form>
        {muted
          ? <form action="/api/control" method="post"><input type="hidden" name="_csrf" value={csrfToken}/>{hiddenFields(detail.instanceKey, detail.groupJid)}<input type="hidden" name="action" value="unmute_group"/><button className="ops-button-muted"><Volume2 className="size-4"/>{labels.unmute}</button></form>
          : <>
            <form action="/api/control" method="post"><input type="hidden" name="_csrf" value={csrfToken}/>{hiddenFields(detail.instanceKey, detail.groupJid)}<input type="hidden" name="action" value="mute_group_8h"/><button className="ops-button-muted"><VolumeX className="size-4"/>{labels.mute8h}</button></form>
            <form action="/api/control" method="post"><input type="hidden" name="_csrf" value={csrfToken}/>{hiddenFields(detail.instanceKey, detail.groupJid)}<input type="hidden" name="action" value="mute_group_7d"/><button className="ops-button-muted"><VolumeX className="size-4"/>{labels.mute7d}</button></form>
          </>}
      </div>
    </section> : null}

    <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <section className="ops-panel overflow-hidden">
        <div className="border-b border-white/[.08] px-5 py-5">
          <div className="flex items-center gap-2"><UserRoundCog className="size-4 text-blue-400"/><h2 className="font-bold text-white">{labels.config}</h2></div>
          <p className="mt-1 text-xs text-zinc-500">{labels.configText}</p>
        </div>
        <form action="/api/control" method="post" className="p-5">
          <input type="hidden" name="_csrf" value={csrfToken}/>
          {hiddenFields(detail.instanceKey, detail.groupJid)}
          <input type="hidden" name="action" value="group_config_update"/>
          <div className="grid gap-2 sm:grid-cols-2">
            {settingRows.map(([name, label, checked]) => <label key={name} className="flex items-center justify-between gap-3 rounded-xl border border-white/[.06] bg-black/20 px-3 py-3 text-sm text-zinc-300">
              <span>{label}</span>
              <input type="checkbox" name={name} defaultChecked={checked} className="size-4 accent-blue-500" disabled={!canManage}/>
            </label>)}
          </div>
          <label className="mt-4 block text-xs font-semibold text-zinc-500"><Languages className="mr-1.5 inline size-3.5"/>{labels.language}
            <select name="language" defaultValue={detail.settings.language ?? ''} className="ops-input mt-2 w-full" disabled={!canManage}>
              <option value="">{labels.automatic}</option><option value="es">Español</option><option value="en">English</option>
            </select>
          </label>
          <label className="mt-4 block text-xs font-semibold text-zinc-500">{labels.welcomeText}
            <textarea name="welcomeText" maxLength={700} defaultValue={detail.settings.welcomeText ?? ''} className="ops-input mt-2 min-h-20 w-full" disabled={!canManage}/>
          </label>
          <label className="mt-4 block text-xs font-semibold text-zinc-500">{labels.goodbyeText}
            <textarea name="goodbyeText" maxLength={700} defaultValue={detail.settings.goodbyeText ?? ''} className="ops-input mt-2 min-h-20 w-full" disabled={!canManage}/>
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <span className="ops-badge">{labels.commandPolicy}: {detail.settings.policyProfile.toUpperCase()}</span>
            <span className={detail.settings.adultCategoryAllowed ? 'ops-badge-good' : 'ops-badge'}>{labels.adultCategory}: {detail.settings.adultCategoryAllowed ? 'ON' : 'OFF'}</span>
          </div>
          {canManage ? <button className="ops-button-primary mt-5"><Save className="size-4"/>{labels.save}</button> : null}
        </form>
      </section>

      <section className="ops-panel overflow-hidden">
        <div className="border-b border-white/[.08] px-5 py-5">
          <div className="flex items-center gap-2"><UsersRound className="size-4 text-blue-400"/><h2 className="font-bold text-white">{labels.membersTitle}</h2></div>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{labels.membersText}</p>
        </div>
        {detail.members.length ? <div className="max-h-[570px] divide-y divide-white/[.06] overflow-y-auto">
          {detail.members.map((member) => <div key={member.jid} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0"><p className="truncate font-mono text-xs text-zinc-300">{maskedMember(member.jid)}</p></div>
            <div className="flex shrink-0 gap-1.5">{member.bot ? <span className="ops-badge-good">{labels.bot}</span> : null}{member.superAdmin ? <span className="ops-badge-warn">{labels.superAdmin}</span> : member.admin ? <span className="ops-badge">{labels.admin}</span> : null}</div>
          </div>)}
        </div> : <p className="px-5 py-8 text-sm text-zinc-600">{labels.noMembers}</p>}
      </section>
    </div>

    {canManage ? <section className="mt-5 ops-panel p-5">
      <div className="flex items-center gap-2"><Megaphone className="size-4 text-blue-400"/><h2 className="font-bold text-white">{labels.broadcast}</h2></div>
      <p className="mt-1 text-xs text-zinc-500">{labels.broadcastText}</p>
      <form action="/api/control" method="post" className="mt-4">
        <input type="hidden" name="_csrf" value={csrfToken}/>
        {hiddenFields(detail.instanceKey, detail.groupJid)}
        <input type="hidden" name="action" value="group_broadcast"/>
        <textarea name="message" maxLength={2000} required className="ops-input min-h-24 w-full" placeholder={labels.messagePlaceholder}/>
        <button className="ops-button-primary mt-3"><Megaphone className="size-4"/>{labels.send}</button>
      </form>
    </section> : null}

    {canLeave ? <section className="mt-5 rounded-2xl border border-red-500/15 bg-red-500/[.04] p-5">
      <h2 className="font-bold text-red-200">{labels.danger}</h2>
      <p className="mt-1 text-xs text-red-300/60">{labels.leaveText}</p>
      <form action="/api/control" method="post" className="mt-4">
        <input type="hidden" name="_csrf" value={csrfToken}/>
        {hiddenFields(detail.instanceKey, detail.groupJid)}
        <input type="hidden" name="action" value="leave_group"/>
        <button className="ops-button-danger">{labels.leave}</button>
      </form>
    </section> : null}

    <p className="mt-5 text-xs text-zinc-700">{labels.created}: {formatDate(detail.createdAt, locale)} · {labels.updated}: {formatDate(detail.updatedAt, locale)}</p>
  </div>
}
