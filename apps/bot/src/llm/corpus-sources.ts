export type CorpusSource = {
  id: string
  title: string
  category: 'programming' | 'language' | 'math' | 'culture'
  url: string
  filename: string
  license: string
  enabledByDefault: boolean
}

export const CORPUS_SOURCES: CorpusSource[] = [
  { id: 'ts-book', title: 'TypeScript Notes for Professionals', category: 'programming', url: 'https://goalkicker.com/TypeScriptBook/TypeScriptNotesForProfessionals.pdf', filename: 'typescript-notes.pdf', license: 'Referencia pública; verificar términos del sitio', enabledByDefault: true },
  { id: 'node-book', title: 'Node.js Notes for Professionals', category: 'programming', url: 'https://goalkicker.com/NodeJSBook/NodeJSNotesForProfessionals.pdf', filename: 'nodejs-notes.pdf', license: 'Referencia pública; verificar términos del sitio', enabledByDefault: true },
  { id: 'algorithms-book', title: 'Algorithms Notes for Professionals', category: 'programming', url: 'https://goalkicker.com/AlgorithmsBook/AlgorithmsNotesForProfessionals.pdf', filename: 'algorithms-notes.pdf', license: 'Referencia pública; verificar términos del sitio', enabledByDefault: true },
  { id: 'spanish-dictionary', title: 'Kaikki / Wiktionary Español', category: 'language', url: 'https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.json', filename: 'spanish-wiktionary.json', license: 'Wiktionary data; revisar licencia del snapshot', enabledByDefault: true },
  { id: 'mexicanismos', title: 'Diccionario de Mexicanismos', category: 'language', url: 'https://www.academia.org.mx/images/stories/diccionario/Diccionario_de_mexicanismos.pdf', filename: 'mexicanismos.pdf', license: 'Verificar términos de redistribución', enabledByDefault: false },
  { id: 'math-for-ml', title: 'Mathematics for Machine Learning', category: 'math', url: 'https://mml-book.github.io/book/mml-book.pdf', filename: 'math-for-ml.pdf', license: 'CC BY-NC-SA 3.0', enabledByDefault: true },
  { id: 'attention-paper', title: 'Attention Is All You Need', category: 'math', url: 'https://arxiv.org/pdf/1706.03762.pdf', filename: 'attention-paper.pdf', license: 'Artículo disponible en arXiv; respetar licencia/origen', enabledByDefault: true },
  { id: 'gutenberg-quijote', title: 'Don Quijote (Project Gutenberg)', category: 'culture', url: 'https://www.gutenberg.org/cache/epub/2000/pg2000.txt.utf8', filename: 'don-quijote.txt', license: 'Project Gutenberg / dominio público según edición', enabledByDefault: true },
  { id: 'gutenberg-art-war', title: 'El arte de la guerra (Project Gutenberg)', category: 'culture', url: 'https://www.gutenberg.org/files/17748/17748-0.txt', filename: 'arte-de-la-guerra.txt', license: 'Project Gutenberg / dominio público según edición', enabledByDefault: true },
]

export function getCorpusSource(id: string) {
  return CORPUS_SOURCES.find((source) => source.id === id)
}
