import type { TranslationCatalog } from '../../types.js'

export const messages: TranslationCatalog = {
  'interactive.authRequired': 'La sesión de WhatsApp todavía no está autenticada.',
  'interactive.navigation.title': 'Navegación',
  'interactive.navigation.more': 'Hay más opciones disponibles.',
  'assistant.identity': 'Soy Ghost Nexora Bot.',
  'assistant.title': 'Ghost Nexora · Asistente',
  'assistant.researchTitle': 'Ghost Nexora · Investigación',
  'assistant.languageInstruction': 'Responde siempre en español, incluso si el mensaje recibido está en otro idioma, salvo que el usuario esté pidiendo explícitamente una traducción.',
  'assistant.researchInstruction': 'Para investigación, usa únicamente las fuentes entregadas como evidencia factual. Cita afirmaciones importantes con [1], [2], etc. Si las fuentes no permiten confirmar algo, dilo explícitamente. Termina con una sección "Fuentes" que conserve las URLs proporcionadas.',
  'assistant.researchTopic': 'Tema de investigación: {query}\n\nFuentes obtenidas:\n{sources}\n\nElabora una síntesis clara, separa hechos de incertidumbres y cita las fuentes por número.',
}
