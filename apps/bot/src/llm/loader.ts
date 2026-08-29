import fs from 'node:fs'
import path from 'node:path'
import pdf from 'pdf-parse'
import mammoth from 'mammoth'

export async function loadCorpus(dir = './corpus'): Promise<string> {
  let fullText = ''
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    return ''
  }

  for (const file of fs.readdirSync(dir).sort()) {
    const fullPath = path.join(dir, file)
    const ext = path.extname(file).toLowerCase()
    try {
      if (ext === '.txt') {
        fullText += `${fs.readFileSync(fullPath, 'utf8')}\n`
      } else if (ext === '.pdf') {
        const data = await pdf(fs.readFileSync(fullPath))
        fullText += `${data.text}\n`
      } else if (ext === '.docx') {
        const result = await mammoth.extractRawText({ path: fullPath })
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
