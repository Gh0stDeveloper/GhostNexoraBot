export type InteractiveSelectRow = {
  id: string
  title: string
  description?: string
  header?: string
}

export type InteractiveSelectSection = {
  title: string
  rows: InteractiveSelectRow[]
}

export type InteractiveButton =
  | { type: 'reply'; text: string; id: string }
  | { type: 'url'; text: string; url: string }
  | { type: 'select'; text: string; sections: InteractiveSelectSection[] }

export type CarouselCard = {
  title: string
  body: string
  imageUrl?: string
  footer?: string
  buttons: InteractiveButton[]
}

export const WHATSAPP_STABLE_UI_POLICY = Object.freeze({
  nativeCarousel: false,
  maxCards: 8,
  maxNativeButtons: 3,
  maxButtonsPerCarouselCard: 2,
  maxSelectSections: 8,
  maxRowsPerSection: 10,
})

export type CardCompatibilityPlan =
  | { mode: 'standard-message'; reason: 'no-actions' }
  | { mode: 'native-flow'; reason: 'supported-actions'; buttons: InteractiveButton[] }
  | { mode: 'text-fallback'; reason: 'mixed-select-actions'; buttons: InteractiveButton[] }

export type CarouselCompatibilityPlan =
  | {
      mode: 'select-first'
      reason: 'command-actions'
      cards: CarouselCard[]
      sections: InteractiveSelectSection[]
    }
  | {
      mode: 'text-fallback'
      reason: 'no-command-actions' | 'contains-url-actions' | 'contains-nested-select'
      cards: CarouselCard[]
    }

function trimmed(value: string, max: number) {
  const normalized = value.trim()
  return normalized.length > max ? `${normalized.slice(0, Math.max(0, max - 1))}…` : normalized
}

export function planInteractiveCard(buttons: readonly InteractiveButton[]): CardCompatibilityPlan {
  const source = buttons.slice(0, WHATSAPP_STABLE_UI_POLICY.maxNativeButtons)
  if (!source.length) return { mode: 'standard-message', reason: 'no-actions' }
  const selectCount = source.filter((button) => button.type === 'select').length
  if (selectCount > 0 && source.length > 1) {
    return { mode: 'text-fallback', reason: 'mixed-select-actions', buttons: [...source] }
  }
  return { mode: 'native-flow', reason: 'supported-actions', buttons: [...source] }
}

export function carouselSelectSections(cards: readonly CarouselCard[]): InteractiveSelectSection[] {
  return cards
    .slice(0, WHATSAPP_STABLE_UI_POLICY.maxSelectSections)
    .map((card, index) => {
      const rows = card.buttons
        .filter((button): button is Extract<InteractiveButton, { type: 'reply' }> => button.type === 'reply')
        .slice(0, WHATSAPP_STABLE_UI_POLICY.maxRowsPerSection)
        .map((button) => ({
          id: button.id,
          title: trimmed(button.text || card.title || `Opción ${index + 1}`, 72),
          description: card.body ? trimmed(card.body, 72) : undefined,
        }))
      return {
        title: trimmed(card.title || `Resultado ${index + 1}`, 72),
        rows,
      }
    })
    .filter((section) => section.rows.length > 0)
}

export function planCarousel(cards: readonly CarouselCard[]): CarouselCompatibilityPlan {
  const source = cards.slice(0, WHATSAPP_STABLE_UI_POLICY.maxCards).map((card) => ({
    ...card,
    buttons: card.buttons.slice(0, WHATSAPP_STABLE_UI_POLICY.maxButtonsPerCarouselCard),
  }))

  if (source.some((card) => card.buttons.some((button) => button.type === 'select'))) {
    return { mode: 'text-fallback', reason: 'contains-nested-select', cards: source }
  }
  if (source.some((card) => card.buttons.some((button) => button.type === 'url'))) {
    return { mode: 'text-fallback', reason: 'contains-url-actions', cards: source }
  }
  if (!source.some((card) => card.buttons.some((button) => button.type === 'reply'))) {
    return { mode: 'text-fallback', reason: 'no-command-actions', cards: source }
  }

  const sections = carouselSelectSections(source)
  if (!sections.length) return { mode: 'text-fallback', reason: 'no-command-actions', cards: source }
  return { mode: 'select-first', reason: 'command-actions', cards: source, sections }
}

export function interactiveButtonsToText(buttons: readonly InteractiveButton[]): string[] {
  const lines: string[] = []
  for (const button of buttons) {
    if (button.type === 'reply') {
      lines.push(`${button.text}: ${button.id}`)
      continue
    }
    if (button.type === 'url') {
      lines.push(`${button.text}: ${button.url}`)
      continue
    }
    if (button.text) lines.push(button.text)
    for (const section of button.sections) {
      if (section.title) lines.push(section.title)
      for (const row of section.rows) {
        const description = row.description ? ` — ${row.description}` : ''
        lines.push(`• ${row.title}${description}: ${row.id}`)
      }
    }
  }
  return lines
}

export function cardFallbackText(input: {
  title: string
  body: string
  footer?: string
  buttons?: readonly InteractiveButton[]
}) {
  return [
    input.title ? `*${input.title}*` : '',
    input.body,
    ...(input.buttons?.length ? ['', ...interactiveButtonsToText(input.buttons)] : []),
    input.footer ? `\n_${input.footer}_` : '',
  ].filter(Boolean).join('\n')
}

export function carouselFallbackText(input: {
  title: string
  body?: string
  footer?: string
  cards: readonly CarouselCard[]
}) {
  const cards = input.cards.slice(0, WHATSAPP_STABLE_UI_POLICY.maxCards).map((card, index) => [
    `${index + 1}. *${card.title}*`,
    card.body,
    ...interactiveButtonsToText(card.buttons.slice(0, WHATSAPP_STABLE_UI_POLICY.maxButtonsPerCarouselCard)),
  ].filter(Boolean).join('\n'))
  return [
    input.title ? `*${input.title}*` : '',
    input.body,
    ...cards,
    input.footer ? `\n_${input.footer}_` : '',
  ].filter(Boolean).join('\n\n')
}
