'use client'

import { Code2, ExternalLink } from 'lucide-react'
import { languageLabel, summarizeCode } from './parse-code-blocks'
import { useWebI18n } from '../i18n-provider'

export type CodeCardProps = {
  code: string
  language: string
  onOpen: () => void
}

export function CodeCard({ code, language, onOpen }: CodeCardProps) {
  const { t } = useWebI18n()
  const preview = summarizeCode(code, 3)
  const label = languageLabel(language, t('code.plaintext'), t('code.fallback'))

  return (
    <button type="button" onClick={onOpen} className="nx-code-card" aria-label={t('code.viewAria', { language: label })}>
      <span className="nx-code-card__icon" aria-hidden="true"><Code2 size={20} strokeWidth={2.1} /></span>
      <span className="nx-code-card__body">
        <span className="nx-code-card__title">{t('code.title', { language: label })}</span>
        <span className="nx-code-card__preview">{preview || t('code.block')}</span>
      </span>
      <span className="nx-code-card__action">{t('code.view')} <ExternalLink size={15} /></span>
    </button>
  )
}
