'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Clipboard, Code2, Copy, X } from 'lucide-react'
import hljs from 'highlight.js/lib/common'
import { languageLabel } from './parse-code-blocks'

export type CodeModalProps = {
  open: boolean
  code: string
  language: string
  onClose: () => void
}

function highlight(code: string, language: string) {
  try {
    const supported = hljs.getLanguage(language)
    return supported
      ? hljs.highlight(code, { language, ignoreIllegals: true }).value
      : hljs.highlightAuto(code).value
  } catch {
    return code
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
  }
}

export function CodeModal({ open, code, language, onClose }: CodeModalProps) {
  const [copied, setCopied] = useState(false)
  const html = useMemo(() => highlight(code, language), [code, language])
  const title = languageLabel(language)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) setCopied(false)
  }, [open])

  if (!open || typeof document === 'undefined') return null

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
      return
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = code
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
  }

  return createPortal(
    <div className="nx-code-modal" role="dialog" aria-modal="true" aria-label={`Código de ${title}`}>
      <button className="nx-code-modal__backdrop" onClick={onClose} aria-label="Cerrar visor de código" />
      <section className="nx-code-modal__panel">
        <header className="nx-code-modal__header">
          <div className="nx-code-modal__heading">
            <span className="nx-code-modal__brand"><Code2 size={19} /></span>
            <div>
              <p className="nx-code-modal__eyebrow">Código</p>
              <h2>{title}</h2>
            </div>
          </div>
          <div className="nx-code-modal__controls">
            <button type="button" onClick={copyCode} className="nx-code-modal__copy">
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copiado' : 'Copiar código'}
            </button>
            <button type="button" onClick={onClose} className="nx-code-modal__close" aria-label="Cerrar">
              <X size={19} />
            </button>
          </div>
        </header>
        <div className="nx-code-modal__content code-scroll">
          <pre><code className={`language-${language}`} dangerouslySetInnerHTML={{ __html: html }} /></pre>
        </div>
        <footer className="nx-code-modal__footer">
          <span><Clipboard size={14} /> {code.split('\n').length} líneas</span>
          <span>{title}</span>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
