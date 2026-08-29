declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string
    numpages?: number
    info?: Record<string, unknown>
    version?: string
  }

  type PdfParser = (data: Buffer, options?: Record<string, unknown>) => Promise<PdfParseResult>
  const parse: PdfParser
  export = parse
}
