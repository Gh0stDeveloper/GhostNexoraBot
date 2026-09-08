'use client'

import { Radio } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type ButtonHTMLAttributes } from 'react'

export function OpsAutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, Math.max(5, seconds) * 1000)
    return () => window.clearInterval(timer)
  }, [enabled, router, seconds])

  return <button type="button" onClick={() => setEnabled((value) => !value)} className="ops-button-muted" title="Activa o pausa la actualización automática">
    <Radio className={`size-4 ${enabled ? 'text-emerald-400' : 'text-zinc-600'}`}/>
    {enabled ? `Live · ${seconds}s` : 'Live pausado'}
  </button>
}

export function ConfirmSubmitButton({ confirmText, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { confirmText: string }) {
  return <button {...props} type="submit" onClick={(event) => {
    if (!window.confirm(confirmText)) event.preventDefault()
  }}>{children}</button>
}
