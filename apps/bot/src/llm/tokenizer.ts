import fs from 'node:fs'

const PAIR_SEP = '\u0001'

export class Tokenizer {
  vocab = new Map<string, number>()
  merges = new Map<string, string>()
  idToToken = new Map<number, string>()
  vocabSize = 8000

  train(corpus: string, numMerges = 5000) {
    this.vocab.clear(); this.merges.clear(); this.idToToken.clear()
    const chars = [...new Set(corpus)].sort()
    chars.forEach((token, index) => {
      this.vocab.set(token, index)
      this.idToToken.set(index, token)
    })

    let tokens = [...corpus]
    const limit = Math.max(0, Math.min(numMerges, this.vocabSize - this.vocab.size))
    for (let iteration = 0; iteration < limit && tokens.length > 1; iteration++) {
      const pairs = new Map<string, number>()
      for (let i = 0; i < tokens.length - 1; i++) {
        const key = `${tokens[i]}${PAIR_SEP}${tokens[i + 1]}`
        pairs.set(key, (pairs.get(key) ?? 0) + 1)
      }

      let bestPair = ''
      let bestCount = 0
      for (const [pair, count] of pairs) {
        if (count > bestCount) { bestPair = pair; bestCount = count }
      }
      if (!bestPair || bestCount < 2) break

      const [a, b] = bestPair.split(PAIR_SEP)
      const merged = `${a}${b}`
      const newId = this.vocab.size
      this.vocab.set(merged, newId)
      this.idToToken.set(newId, merged)
      this.merges.set(bestPair, merged)

      const next: string[] = []
      for (let i = 0; i < tokens.length;) {
        if (i < tokens.length - 1 && tokens[i] === a && tokens[i + 1] === b) { next.push(merged); i += 2 }
        else { next.push(tokens[i]!); i++ }
      }
      tokens = next
    }
    this.save()
  }

  encode(text: string): number[] {
    let tokens = [...text.toLocaleLowerCase('es-MX')]
    for (const [pair, merged] of this.merges) {
      const [a, b] = pair.split(PAIR_SEP)
      const next: string[] = []
      for (let i = 0; i < tokens.length;) {
        if (i < tokens.length - 1 && tokens[i] === a && tokens[i + 1] === b) { next.push(merged); i += 2 }
        else { next.push(tokens[i]!); i++ }
      }
      tokens = next
    }
    const unk = this.vocab.get('<unk>') ?? this.vocab.get(' ') ?? 0
    return tokens.map((token) => this.vocab.get(token) ?? unk)
  }

  decode(ids: number[]): string {
    return ids.map((id) => this.idToToken.get(id) ?? '').join('')
  }

  save(filePath = './data/llm/vocab-bpe.json') {
    fs.mkdirSync(requireDir(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify({ version: 2, vocab: Object.fromEntries(this.vocab), merges: Object.fromEntries(this.merges), idToToken: Object.fromEntries(this.idToToken) }))
  }

  load(filePath = './data/llm/vocab-bpe.json') {
    if (!fs.existsSync(filePath)) return false
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { vocab?: Record<string, number>; merges?: Record<string, string>; idToToken?: Record<string, string> }
    this.vocab = new Map(Object.entries(data.vocab ?? {}).map(([key, value]) => [key, Number(value)]))
    this.merges = new Map(Object.entries(data.merges ?? {}))
    this.idToToken = new Map(Object.entries(data.idToToken ?? {}).map(([key, value]) => [Number(key), value]))
    return this.vocab.size > 0
  }
}

function requireDir(filePath: string) {
  const directory = filePath.slice(0, Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')))
  return directory || '.'
}
