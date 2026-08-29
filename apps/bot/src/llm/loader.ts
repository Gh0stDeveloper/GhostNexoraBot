import fs from 'node:fs'
import path from 'node:path'

type PdfModule = { default?: (buffer: Buffer) => Promise<{ text: string }> }
type MammothModule = { default?: { extractRawText: (options: { path: string }) => Promise<{ value: string }> }; extractRawText?: (options: { path: string }) => Promise<{ value: string }> }

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.pdf', '.docx'])

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

export async function loadCorpus(dir = './corpus'): Promise<string> {
  let fullText = ''
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    return ''
  }

  for (const fullPath of listCorpusFiles(dir)) {
    const file = path.relative(dir, fullPath)
    const ext = path.extname(fullPath).toLowerCase()
    try {
      if (ext === '.txt') {
        fullText += `${fs.readFileSync(fullPath, 'utf8')}\n`
      } else if (ext === '.pdf') {
        const module = await import('pdf-parse') as unknown as PdfModule
        const parser = module.default
        if (!parser) throw new Error('pdf-parse no expone un parser compatible.')
        const data = await parser(fs.readFileSync(fullPath))
        fullText += `${data.text}\n`
      } else if (ext === '.docx') {
        const module = await import('mammoth') as unknown as MammothModule
        const extractRawText = module.extractRawText ?? module.default?.extractRawText
        if (!extractRawText) throw new Error('mammoth no expone extractRawText.')
        const result = await extractRawText({ path: fullPath })
        fullText += `${result.value}\n`
      }
    } catch (error) {
      console.error(`Error leyendo ${file}:`, error)
    }
  }

  return cleanText(fullText)
}

export function cleanText(text: string): string {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('es-MX')
    .replace(/[^\p{L}\p{N}\s.,!?;:'"()\-_/\\]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
