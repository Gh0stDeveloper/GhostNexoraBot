'use client'

import { Code2, ExternalLink } from 'lucide-react'
import { languageLabel, summarizeCode } from './parse-code-blocks'

export type CodeCardProps = {
  code: string
  language: string
  onOpen: () => void
}

export function CodeCard({ code, language, onOpen }: CodeCardProps) {
  const preview = summarizeCode(code, 3)
  const label = languageLabel(language)

  return (
    <button type="button" onClick={onOpen} className="nx-code-card" aria-label={`Ver código de ${label}`}>
      <span className="nx-code-card__icon" aria-hidden="true"><Code2 size={20} strokeWidth={2.1} /></span>
      <span className="nx-code-card__body">
        <span className="nx-code-card__title">Código de {label}</span>
        <span className="nx-code-card__preview">{preview || 'Bloque de código'}</span>
      </span>
      <span className="nx-code-card__action">Ver código <ExternalLink size={15} /></span>
    </button>
  )
}
