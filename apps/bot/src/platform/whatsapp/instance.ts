export function whatsappOpsInstanceKey(botInstanceId: string) {
  const normalized = botInstanceId.trim().toLowerCase()
  const match = /^subbot-(\d+)$/.exec(normalized)
  if (match?.[1]) return `subbot:${Number(match[1])}`
  return 'main'
}
