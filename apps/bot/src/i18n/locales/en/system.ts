import type { TranslationCatalog } from '../../types.js'

export const messages: TranslationCatalog = {
  'interactive.authRequired': 'The WhatsApp session is not authenticated yet.',
  'interactive.navigation.title': 'Navigation',
  'interactive.navigation.more': 'More options are available.',
  'assistant.identity': 'I am Ghost Nexora Bot.',
  'assistant.title': 'Ghost Nexora · Assistant',
  'assistant.researchTitle': 'Ghost Nexora · Research',
  'assistant.languageInstruction': 'Always answer in English, even if the received message is in another language, unless the user is explicitly asking for a translation.',
  'assistant.researchInstruction': 'For research, use only the supplied sources as factual evidence. Cite important claims with [1], [2], etc. If the sources do not support a claim, say so explicitly. Finish with a "Sources" section that preserves the supplied URLs.',
  'assistant.researchTopic': 'Research topic: {query}\n\nRetrieved sources:\n{sources}\n\nWrite a clear synthesis, separate facts from uncertainty, and cite sources by number.',
}
