'use client'

import { CheckCircle2, Command, Radio, TriangleAlert, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { useWebI18n } from './i18n-provider'

export function OpsAutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter()
  const { t } = useWebI18n()
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, Math.max(5, seconds) * 1000)
    return () => window.clearInterval(timer)
  }, [enabled, router, seconds])

  return <button type="button" onClick={() => setEnabled((value) => !value)} className="ops-button-muted" title={t('ops.liveTitle')}>
    <Radio className={`size-4 ${enabled ? 'text-emerald-400' : 'text-zinc-600'}`}/>
    {enabled ? `Live · ${seconds}s` : t('ops.livePaused')}
  </button>
}

export function ConfirmSubmitButton({
  confirmText,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { confirmText: string }) {
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)
  const { locale } = useWebI18n()
  const title = locale === 'es' ? 'Confirmar acción' : 'Confirm action'
  const cancel = locale === 'es' ? 'Cancelar' : 'Cancel'
  const confirm = locale === 'es' ? 'Confirmar' : 'Confirm'

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return <>
    <button
      {...props}
      type="button"
      onClick={(event) => {
        formRef.current = event.currentTarget.form
        setOpen(true)
      }}
    >
      {children}
    </button>

    {open ? <div className="ops-modal-layer" role="presentation">
      <button type="button" className="ops-modal-backdrop" aria-label={cancel} onClick={() => setOpen(false)}/>
      <div className="ops-modal" role="dialog" aria-modal="true" aria-labelledby="ops-confirm-title">
        <div className="ops-modal-icon ops-modal-icon-warn"><TriangleAlert className="size-5"/></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="ops-confirm-title" className="text-base font-black text-white">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500">{confirmText}</p>
            </div>
            <button type="button" className="ops-icon-button" aria-label={cancel} onClick={() => setOpen(false)}><X className="size-4"/></button>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="ops-button-muted" onClick={() => setOpen(false)}>{cancel}</button>
            <button
              type="button"
              className={String(props.className ?? '').includes('danger') ? 'ops-button-danger' : 'ops-button-primary'}
              onClick={() => {
                setOpen(false)
                formRef.current?.requestSubmit()
              }}
            >
              {confirm}
            </button>
          </div>
        </div>
      </div>
    </div> : null}
  </>
}

export function OpsToast({
  tone,
  children,
}: {
  tone: 'success' | 'error'
  children: ReactNode
}) {
  const [visible, setVisible] = useState(true)
  const { locale } = useWebI18n()
  const closeLabel = locale === 'es' ? 'Cerrar' : 'Close'

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 6500)
    return () => window.clearTimeout(timer)
  }, [])

  if (!visible) return null
  const Icon = tone === 'success' ? CheckCircle2 : TriangleAlert
  return <div className={`ops-toast ops-toast-${tone}`} role={tone === 'error' ? 'alert' : 'status'} aria-live="polite">
    <Icon className="mt-0.5 size-4 shrink-0"/>
    <div className="min-w-0 flex-1 text-sm leading-5">{children}</div>
    <button type="button" className="ops-toast-close" aria-label={closeLabel} onClick={() => setVisible(false)}><X className="size-3.5"/></button>
  </div>
}

export function OpsCommandHint() {
  const { locale } = useWebI18n()
  return <span className="ops-command-hint" aria-hidden="true">
    <Command className="size-3"/>
    {locale === 'es' ? 'Buscar' : 'Search'}
    <kbd>⌘K</kbd>
  </span>
}
