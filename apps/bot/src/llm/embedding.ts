export class Embedding {
  readonly dim = 128
  readonly table = new Map<string, Float32Array>()

  hashEmbed(text: string): Float32Array {
    const vector = new Float32Array(this.dim)
    const value = text.toLocaleLowerCase('es-MX')
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i)
      const index = (code * 31 + i * 17) % this.dim
      vector[index] += 1
      vector[(index + 1) % this.dim] += 0.5
    }
    let norm = 0
    for (const x of vector) norm += x * x
    norm = Math.sqrt(norm) || 1
    for (let i = 0; i < this.dim; i++) vector[i] /= norm
    return vector
  }

  train(sentences: string[]) {
    for (const sentence of sentences) {
      const words = sentence.split(/\s+/).filter(Boolean)
      for (let i = 0; i < words.length; i++) {
        const context = words.slice(Math.max(0, i - 2), i + 3).join(' ')
        this.table.set(words[i]!, this.hashEmbed(context))
      }
    }
  }

  get(text: string): Float32Array {
    return this.table.get(text) ?? this.hashEmbed(text)
  }
}
