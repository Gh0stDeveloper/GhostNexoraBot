import fs from 'node:fs'
import path from 'node:path'

export type VectorSearchResult = { id: number; text: string; score: number }

const MAGIC = Buffer.from('NXVEC1\0', 'ascii')

export class VectorStore {
  readonly dim: number
  readonly filePath: string

  constructor(dim = 128, filePath = './data/llm/corpus-v2.bin') {
    this.dim = dim
    this.filePath = filePath
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, MAGIC)
  }

  append(id: number, vector: Float32Array, text: string) {
    if (vector.length !== this.dim) throw new Error(`Vector dimension mismatch: expected ${this.dim}`)
    const textBuffer = Buffer.from(text, 'utf8').subarray(0, 65535)
    const header = Buffer.alloc(6)
    header.writeUInt32LE(id >>> 0, 0)
    header.writeUInt16LE(textBuffer.length, 4)
    const vectorBuffer = Buffer.allocUnsafe(this.dim * 4)
    for (let i = 0; i < this.dim; i++) vectorBuffer.writeFloatLE(vector[i]!, i * 4)
    const fd = fs.openSync(this.filePath, 'a')
    try { fs.writeSync(fd, header); fs.writeSync(fd, vectorBuffer); fs.writeSync(fd, textBuffer) }
    finally { fs.closeSync(fd) }
  }

  search(query: Float32Array, topK = 5): VectorSearchResult[] {
    if (query.length !== this.dim) throw new Error(`Query dimension mismatch: expected ${this.dim}`)
    if (!fs.existsSync(this.filePath)) return []
    const file = fs.readFileSync(this.filePath)
    if (file.length < MAGIC.length || !file.subarray(0, MAGIC.length).equals(MAGIC)) return []
    const results: VectorSearchResult[] = []
    let offset = MAGIC.length
    while (offset + 6 <= file.length) {
      const id = file.readUInt32LE(offset); const textLen = file.readUInt16LE(offset + 4); offset += 6
      const vectorBytes = this.dim * 4
      if (offset + vectorBytes + textLen > file.length) break
      const vector = new Float32Array(this.dim)
      for (let i = 0; i < this.dim; i++) vector[i] = file.readFloatLE(offset + i * 4)
      offset += vectorBytes
      const text = file.subarray(offset, offset + textLen).toString('utf8'); offset += textLen
      results.push({ id, text, score: this.cosine(query, vector) })
    }
    return results.sort((a, b) => b.score - a.score).slice(0, Math.max(1, topK))
  }

  cosine(a: Float32Array, b: Float32Array) {
    let dot = 0, normA = 0, normB = 0
    const length = Math.min(a.length, b.length)
    for (let i = 0; i < length; i++) { dot += a[i]! * b[i]!; normA += a[i]! * a[i]!; normB += b[i]! * b[i]! }
    return dot / ((Math.sqrt(normA) * Math.sqrt(normB)) + 1e-8)
  }
}
