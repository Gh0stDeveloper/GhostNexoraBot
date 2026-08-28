export type AdultGiftKey = 'tease' | 'flirt' | 'seduce' | 'kiss' | 'cuddle' | 'blush' | 'love' | 'bite'

export const adultNonExplicitGifts: Record<AdultGiftKey, readonly string[]> = {
  tease: ['✨ Te manda una mirada provocadora.', '😏 Te dedica una sonrisa juguetona.'],
  flirt: ['💘 Te manda un cumplido coqueto.', '😉 Te guiña el ojo de forma juguetona.'],
  seduce: ['💫 Se acerca con una actitud coqueta.', '🌹 Te dedica una escena romántica y sugerente, sin contenido explícito.'],
  kiss: ['💋 Te manda un beso.', '💞 Te da un beso cariñoso.'],
  cuddle: ['🤗 Te abraza y se queda cerca.', '🫶 Compartes un momento cariñoso.'],
  blush: ['☺️ Se sonroja al verte.', '🌸 Se pone tímido/a contigo.'],
  love: ['❤️ Te demuestra cariño.', '💖 Te deja un pequeño regalo romántico.'],
  bite: ['🦷 Te da una mordida juguetona.', '😈 Una mordida traviesa, sin contenido gráfico.'],
}

export function randomAdultGift(key: AdultGiftKey): string {
  const options = adultNonExplicitGifts[key] ?? adultNonExplicitGifts.flirt
  return options[Math.floor(Math.random() * options.length)]
}
