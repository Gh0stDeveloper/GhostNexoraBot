'use client'

import {
  Activity,
  Bot,
  Boxes,
  Coins,
  Download,
  Fingerprint,
  Gauge,
  GitBranch,
  Home,
  LayoutDashboard,
  LogIn,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  ScrollText,
  RefreshCcw,
  SquareTerminal,
  UserRound,
  UsersRound,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

export type UnifiedNavIcon =
  | 'home'
  | 'dashboard'
  | 'download'
  | 'activity'
  | 'flow'
  | 'modules'
  | 'security'
  | 'platforms'
  | 'providers'
  | 'commands'
  | 'groups'
  | 'users'
  | 'economy'
  | 'logs'
  | 'jobs'
  | 'updates'
  | 'audit'
  | 'diagnostics'
  | 'settings'
  | 'subbots'
  | 'account'

export type UnifiedNavItem = {
  id: string
  label: string
  href: string
  icon: UnifiedNavIcon
  active?: boolean
}

const icons: Record<UnifiedNavIcon, LucideIcon> = {
  home: Home,
  dashboard: LayoutDashboard,
  download: Download,
  activity: Activity,
  flow: GitBranch,
  modules: Boxes,
  security: Fingerprint,
  platforms: Activity,
  providers: Boxes,
  commands: SquareTerminal,
  groups: UsersRound,
  users: UserRound,
  economy: Coins,
  logs: ScrollText,
  jobs: Activity,
  updates: RefreshCcw,
  audit: Gauge,
  diagnostics: Wrench,
  settings: Settings,
  subbots: Bot,
  account: UserRound,
}

function NavigationList({ items, close, ariaLabel, hash }: { items: UnifiedNavItem[]; close?: () => void; ariaLabel: string; hash: string }) {
  return <nav className="ops-sidebar-nav" aria-label={ariaLabel}>
    {items.map((item) => {
      const Icon = icons[item.icon]
      const anchorActive = item.href.startsWith('#')
        ? (hash ? item.href === hash : item.id === 'home')
        : item.active
      return <a
        key={item.id}
        href={item.href}
        onClick={close}
        aria-current={anchorActive ? 'page' : undefined}
        className={anchorActive ? 'ops-sidebar-link ops-sidebar-link-active' : 'ops-sidebar-link'}
      >
        <Icon className="size-4 shrink-0"/>
        <span className="truncate">{item.label}</span>
      </a>
    })}
  </nav>
}

export function UnifiedNavigation({
  items,
  brandTitle = 'GHOST NEXORA BOT',
  brandSubtitle,
  brandHref = '/',
  badge,
  actionHref,
  actionLabel,
  ariaLabel,
  closeLabel,
}: {
  items: UnifiedNavItem[]
  brandTitle?: string
  brandSubtitle: string
  brandHref?: string
  badge?: string
  actionHref?: string
  actionLabel?: string
  ariaLabel: string
  closeLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hash, setHash] = useState('')
  const searchRef = useRef<HTMLInputElement | null>(null)
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? items.filter((item) => item.label.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle)) : items
  }, [items, query])

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash)
    syncHash()
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      } else if (event.key === 'Escape') {
        setPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!paletteOpen) {
      setQuery('')
      return
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => {
      document.body.style.overflow = previous
    }
  }, [paletteOpen])

  return <>
    <aside className="ops-sidebar hidden lg:flex" aria-label={ariaLabel}>
      <a href={brandHref} className="ops-sidebar-brand">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]">
          <Bot className="size-5 text-blue-400"/>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-black tracking-wide text-white">{brandTitle}</span>
          <span className="mt-0.5 block truncate text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-500">{brandSubtitle}</span>
        </span>
      </a>

      {badge ? <div className="px-3 pb-2"><span className="ops-badge-good">{badge}</span></div> : null}

      <div className="px-3 pb-2">
        <button type="button" className="ops-command-trigger w-full" onClick={() => setPaletteOpen(true)}>
          <Search className="size-3.5"/>
          <span className="min-w-0 flex-1 truncate text-left">{brandSubtitle}</span>
          <kbd>⌘K</kbd>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <NavigationList items={items} ariaLabel={ariaLabel} hash={hash}/>
      </div>

      {actionHref && actionLabel ? <div className="border-t border-white/[.07] p-3">
        <a href={actionHref} className="ops-button-primary w-full"><LogIn className="size-4"/>{actionLabel}</a>
      </div> : null}
    </aside>

    <div className="ops-mobile-nav lg:hidden">
      <a href={brandHref} className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]"><Bot className="size-4 text-blue-400"/></span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-black tracking-wide text-white">{brandTitle}</span>
          <span className="block truncate text-[9px] font-semibold uppercase tracking-[.12em] text-zinc-500">{brandSubtitle}</span>
        </span>
      </a>
      <div className="flex items-center gap-2">
        <button type="button" className="ops-mobile-menu-button" aria-label={brandSubtitle} onClick={() => setPaletteOpen(true)}>
          <Search className="size-4"/>
        </button>
        <button
          type="button"
          className="ops-mobile-menu-button"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls="ghost-nexora-mobile-navigation"
          onClick={() => setOpen(true)}
        >
          <Menu className="size-5"/>
        </button>
      </div>
    </div>

    {paletteOpen ? <div className="ops-modal-layer" role="presentation">
      <button type="button" className="ops-modal-backdrop" aria-label={closeLabel} onClick={() => setPaletteOpen(false)}/>
      <div className="ops-command-palette" role="dialog" aria-modal="true" aria-label={brandSubtitle}>
        <div className="ops-command-search">
          <Search className="size-4 text-zinc-500"/>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={brandSubtitle}
            aria-label={brandSubtitle}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="ops-command-results">
          {filteredItems.length ? filteredItems.map((item) => {
            const Icon = icons[item.icon]
            return <a key={item.id} href={item.href} className="ops-command-result" onClick={() => setPaletteOpen(false)}>
              <span className="ops-command-result-icon"><Icon className="size-4"/></span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.active ? <span className="ops-badge-good">ACTIVO</span> : null}
            </a>
          }) : <div className="ops-empty-state compact">
            <Search className="size-5"/>
            <p>No results</p>
          </div>}
        </div>
      </div>
    </div> : null}

    {open ? <div className="ops-drawer-layer lg:hidden">
      <button className="ops-drawer-overlay" type="button" aria-label={closeLabel} onClick={() => setOpen(false)}/>
      <aside id="ghost-nexora-mobile-navigation" className="ops-drawer" aria-label={ariaLabel}>
        <div className="flex items-center justify-between gap-3 border-b border-white/[.07] p-4">
          <a href={brandHref} onClick={() => setOpen(false)} className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/[.08]"><Bot className="size-4 text-blue-400"/></span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-black tracking-wide text-white">{brandTitle}</span>
              <span className="block truncate text-[9px] font-semibold uppercase tracking-[.12em] text-zinc-500">{brandSubtitle}</span>
            </span>
          </a>
          <button type="button" className="ops-mobile-menu-button" aria-label={closeLabel} onClick={() => setOpen(false)}><X className="size-5"/></button>
        </div>
        {badge ? <div className="px-4 pt-4"><span className="ops-badge-good">{badge}</span></div> : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <NavigationList items={items} close={() => setOpen(false)} ariaLabel={ariaLabel} hash={hash}/>
        </div>
        {actionHref && actionLabel ? <div className="border-t border-white/[.07] p-4">
          <a href={actionHref} onClick={() => setOpen(false)} className="ops-button-primary w-full"><LogIn className="size-4"/>{actionLabel}</a>
        </div> : null}
      </aside>
    </div> : null}
  </>
}
