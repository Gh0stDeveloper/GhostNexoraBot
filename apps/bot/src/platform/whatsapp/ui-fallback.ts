import { normalizedUiToText, type NormalizedUi, type UiItem } from '@ghostnexora/platform-contracts'

function carouselAsCard(ui: Extract<NormalizedUi, { kind: 'carousel' }>): NormalizedUi {
  const first = ui.cards[0]
  return {
    kind: 'card',
    title: ui.title || first?.title || 'Ghost Nexora Bot',
    body: [
      first?.body,
      ui.cards.length > 1 ? `+${ui.cards.length - 1} resultado(s) adicionales` : '',
    ].filter(Boolean).join('\n'),
    ...(first?.imageUrl ? { imageUrl: first.imageUrl } : {}),
    ...(first?.footer ? { footer: first.footer } : {}),
    ...(first?.buttons?.length ? { buttons: first.buttons } : {}),
  }
}

function asList(ui: Exclude<NormalizedUi, { kind: 'text' | 'list' }>): NormalizedUi {
  const items: UiItem[] = ui.kind === 'card'
    ? [{
        id: 'card',
        title: ui.title,
        ...(ui.body ? { description: ui.body } : {}),
        ...(ui.buttons?.[0] ? { action: ui.buttons[0] } : {}),
      }]
    : ui.cards.map((card, index) => ({
        id: card.id || String(index),
        title: card.title,
        ...(card.body ? { description: card.body } : {}),
        ...(card.buttons?.[0] ? { action: card.buttons[0] } : {}),
      }))
  return {
    kind: 'list',
    title: ui.title,
    ...(ui.kind === 'carousel' ? {} : ui.body ? { body: ui.body } : {}),
    items,
  }
}

export function whatsappUiFallbackChain(ui: NormalizedUi): NormalizedUi[] {
  if (ui.kind === 'text') return [ui]
  const stages: NormalizedUi[] = [ui]
  if (ui.kind === 'carousel') {
    const card = carouselAsCard(ui)
    stages.push(card, asList(ui))
  } else if (ui.kind === 'card') {
    stages.push(asList(ui))
  }
  if (ui.kind === 'list') stages.push(ui)
  const text = normalizedUiToText(ui) || 'Ghost Nexora Bot'
  stages.push({ kind: 'text', text })
  const seen = new Set<string>()
  return stages.filter((stage) => {
    const signature = JSON.stringify(stage)
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
}
