export type CorpusCategory = 'general' | 'programming' | 'science' | 'spanish' | 'literature'

export type CorpusSource = {
  id: string
  title: string
  category: CorpusCategory
  url: string
  filename: string
  license: string
  enabledByDefault: boolean
  note?: string
}

export const CORPUS_SOURCES: CorpusSource[] = [
  // 1. CONOCIMIENTO GENERAL
  {
    id: 'wikipedia-es',
    title: 'Wikipedia en español — dump de artículos',
    category: 'general',
    url: 'https://dumps.wikimedia.org/eswiki/latest/eswiki-latest-pages-articles-multistream.xml.bz2',
    filename: 'wikipedia-es.xml.bz2',
    license: 'Contenido bajo licencias de Wikimedia; verificar atribución/licencia por contenido',
    enabledByDefault: false,
    note: 'Dump grande; descarga manual recomendada.',
  },
  {
    id: 'wiktionary-es-dump',
    title: 'Wikcionario español — dump de artículos',
    category: 'general',
    url: 'https://dumps.wikimedia.org/eswiktionary/latest/eswiktionary-latest-pages-articles-multistream.xml.bz2',
    filename: 'wiktionary-es.xml.bz2',
    license: 'Contenido Wikimedía; verificar licencia/atribución',
    enabledByDefault: false,
    note: 'Dump grande; útil para vocabulario y definiciones.',
  },
  {
    id: 'tatoeba-es',
    title: 'Tatoeba español — frases y ejemplos',
    category: 'general',
    url: 'https://object.pouta.csc.fi/OPUS-Tatoeba/v2026-07-08/mono/es.txt.gz',
    filename: 'tatoeba-es.txt.gz',
    license: 'CC BY 2.0 FR',
    enabledByDefault: true,
    note: 'Corpus de frases; ideal para estructura lingüística.',
  },

  // 2. PROGRAMACIÓN
  {
    id: 'typescript-es',
    title: 'TypeScript — documentación en español',
    category: 'programming',
    url: 'https://www.typescriptlang.org/es/',
    filename: 'typescript-es.html',
    license: 'Sitio oficial; consultar sus condiciones de reutilización',
    enabledByDefault: true,
  },
  {
    id: 'nodejs-es',
    title: 'Node.js — documentación en español',
    category: 'programming',
    url: 'https://nodejs.org/es/',
    filename: 'nodejs-es.html',
    license: 'Contenido del proyecto Node.js; verificar licencia',
    enabledByDefault: true,
  },
  {
    id: 'mdn-es-glossary',
    title: 'MDN Web Docs — glosario en español',
    category: 'programming',
    url: 'https://developer.mozilla.org/es/docs/Glossary',
    filename: 'mdn-es-glossary.html',
    license: 'CC BY-SA 2.5 o posterior, según contenido de MDN',
    enabledByDefault: true,
  },
  {
    id: 'typescript-handbook',
    title: 'TypeScript Handbook — repositorio oficial',
    category: 'programming',
    url: 'https://github.com/microsoft/TypeScript-Website/archive/refs/heads/main.tar.gz',
    filename: 'typescript-website-main.tar.gz',
    license: 'Apache-2.0 para el repositorio; filtrar contenido antes de entrenar',
    enabledByDefault: false,
    note: 'Repositorio grande; se recomienda seleccionar solo documentación.',
  },

  // 3. CIENCIA / MATEMÁTICAS / IA
  {
    id: 'math-for-ml',
    title: 'Mathematics for Machine Learning',
    category: 'science',
    url: 'https://mml-book.github.io/book/mml-book.pdf',
    filename: 'math-for-ml.pdf',
    license: 'CC BY-NC-SA 3.0',
    enabledByDefault: true,
  },
  {
    id: 'attention-paper',
    title: 'Attention Is All You Need',
    category: 'science',
    url: 'https://arxiv.org/pdf/1706.03762.pdf',
    filename: 'attention-paper.pdf',
    license: 'Artículo disponible en arXiv; respetar licencia/origen',
    enabledByDefault: true,
  },
  {
    id: 'openstax-calculus-es',
    title: 'OpenStax — Cálculo, material educativo abierto',
    category: 'science',
    url: 'https://openstax.org/details/books/cálculo-volumen-1',
    filename: 'openstax-calculo-es.html',
    license: 'OpenStax OER; licencia Creative Commons según edición',
    enabledByDefault: false,
    note: 'Se descarga la página de referencia; para libros completos debe seleccionarse el recurso PDF correspondiente.',
  },

  // 4. ESPAÑOL / LENGUAJE
  {
    id: 'spanish-dictionary',
    title: 'Kaikki / Wiktionary Español',
    category: 'spanish',
    url: 'https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.json',
    filename: 'spanish-wiktionary.json',
    license: 'Datos de Wiktionary; revisar licencia del snapshot',
    enabledByDefault: true,
  },
  {
    id: 'mexicanismos',
    title: 'Diccionario de Mexicanismos',
    category: 'spanish',
    url: 'https://www.academia.org.mx/images/stories/diccionario/Diccionario_de_mexicanismos.pdf',
    filename: 'mexicanismos.pdf',
    license: 'Verificar términos de redistribución',
    enabledByDefault: false,
  },
  {
    id: 'mdn-spanish-style',
    title: 'MDN — guía de estilo en español',
    category: 'spanish',
    url: 'https://developer.mozilla.org/es/docs/MDN/Writing_guidelines/Writing_style_guide',
    filename: 'mdn-spanish-style.html',
    license: 'CC BY-SA 2.5 o posterior, según contenido de MDN',
    enabledByDefault: true,
  },

  // 5. LITERATURA
  {
    id: 'gutenberg-quijote',
    title: 'Don Quijote — Project Gutenberg',
    category: 'literature',
    url: 'https://www.gutenberg.org/cache/epub/2000/pg2000.txt.utf8',
    filename: 'don-quijote.txt',
    license: 'Texto de dominio público en EE. UU. según Project Gutenberg; verificar jurisdicción',
    enabledByDefault: true,
  },
  {
    id: 'gutenberg-electra',
    title: 'Electra — Benito Pérez Galdós',
    category: 'literature',
    url: 'https://www.gutenberg.org/cache/epub/28002/pg28002.txt.utf8',
    filename: 'electra.txt',
    license: 'Project Gutenberg / dominio público en EE. UU. según edición',
    enabledByDefault: true,
  },
  {
    id: 'gutenberg-art-war',
    title: 'El arte de la guerra — Project Gutenberg',
    category: 'literature',
    url: 'https://www.gutenberg.org/files/17748/17748-0.txt',
    filename: 'arte-de-la-guerra.txt',
    license: 'Project Gutenberg / dominio público según edición',
    enabledByDefault: true,
  },
]

export function getCorpusSource(id: string) {
  return CORPUS_SOURCES.find((source) => source.id === id)
}
