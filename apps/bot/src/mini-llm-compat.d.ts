declare module 'pdf-parse' {
  type PdfResult = {
    text?: string
    numpages?: number
    info?: Record<string, unknown>
    metadata?: Record<string, unknown> | null
    version?: string
  }

  type PdfParser = (buffer: Buffer) => Promise<PdfResult>

  const pdfParse: PdfParser
  export default pdfParse
}
