import fs from 'node:fs'
import path from 'node:path'

type PdfModule = { default?: (buffer: Buffer) => Promise<{ text: string }> }
type MammothModule = { default?: { extractRawText: (options: { path: string }) => Promise<{ value: string }> }; extractRawText?: (options: { path: string }) => Promise<{ value: string }> }

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.tsv', '.json', '.xml', '.html', '.htm', '.pdf', '.docx'])
const MAX_CORPUS_CHARS = 20_000_000

function listCorpusFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const files: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...listCorpusFiles(fullPath))
    else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(fullPath)
  }
  return files.sort()
}

function stripMarkup(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
}

function normalizeStructuredText(text: string, ext: string): string {
  if (ext === '.html' || ext === '.htm') return stripMarkup(text)
  if (ext === '.json') {
    try { return JSON.stringify(JSON.parse(text)) } catch { return text }
  }
  if (ext === '.xml') return stripMarkup(text)
  return text
}

export async function loadCorpus(dir = './corpus'): Promise<string> {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    return ''
  }

  const pieces: string[] = []
  let total = 0
  for (const fullPath of listCorpusFiles(dir)) {
    if (total >= MAX_CORPUS_CHARS) break
    const file = path.relative(dir, fullPath)
    const ext = path.extname(fullPath).toLowerCase()
    try {
      let text = ''
      if (['.txt', '.md', '.csv', '.tsv', '.json', '.xml', '.html', '.htm'].includes(ext)) {
        text = normalizeStructuredText(fs.readFileSync(fullPath, 'utf8'), ext)
      } else if (ext === '.pdf') {
        const module = await import('pdf-parse') as unknown as PdfModule
        const parser = module.default
        if (!parser) throw new Error('pdf-parse no expone un parser compatible.')
        text = (await parser(fs.readFileSync(fullPath))).text
      } else if (ext === '.docx') {
        const module = await import('mammoth') as unknown as MammothModule
        const extractRawText = module.extractRawText ?? module.default?.extractRawText
        if (!extractRawText) throw new Error('mammoth no expone extractRawText.')
        text = (await extractRawText({ path: fullPath })).value
      }
      if (!text) continue
      const remaining = MAX_CORPUS_CHARS - total
      pieces.push(text.slice(0, remaining))
      total += Math.min(text.length, remaining)
    } catch (error) {
      console.error(`Error leyendo ${file}:`, error)
    }
  }

  return cleanText(pieces.join('\n'))
}

export function cleanText(text: string): string {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('es-MX')
    .replace(/[^\p{L}\p{N}\s.,!?;:'"()\-_/\\%+=*<>\[\]{}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
