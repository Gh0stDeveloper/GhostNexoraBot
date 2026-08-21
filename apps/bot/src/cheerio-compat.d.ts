export {}

declare module 'cheerio' {
  export type Element = import('domhandler').AnyNode
}
