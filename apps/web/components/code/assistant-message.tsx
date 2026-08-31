'use client'

import { useMemo, useState } from 'react'
import { CodeCard } from './code-card'
import { CodeModal } from './code-modal'
import { parseCodeBlocks } from './parse-code-blocks'
import './code-viewer.css'

export type AssistantMessageProps = {
  content: string
  className?: string
}

export function AssistantMessage({ content, className = '' }: AssistantMessageProps) {
  const segments = useMemo(() => parseCodeBlocks(content), [content])
  const [selected, setSelected] = useState<{ code: string; language: string } | null>(null)

  return (
    <>
      <div className={`nx-assistant-message ${className}`.trim()}>
        {segments.map((segment, index) => {
          if (segment.type === 'code') {
            return (
              <CodeCard
                key={`code-${index}`}
                code={segment.content}
                language={segment.language}
                onOpen={() => setSelected({ code: segment.content, language: segment.language })}
              />
            )
          }

          if (!segment.content) return null
          return (
            <div key={`text-${index}`} className="nx-assistant-message__text">
              {segment.content}
            </div>
          )
        })}
      </div>

      <CodeModal
        open={Boolean(selected)}
        code={selected?.code ?? ''}
        language={selected?.language ?? 'text'}
        onClose={() => setSelected(null)}
      />
    </>
  )
}
