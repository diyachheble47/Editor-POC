// prismjs ships no types and only these two members are used (HtmlCodeEditor).
declare module 'prismjs' {
  const Prism: {
    highlight(code: string, grammar: unknown, language: string): string
    languages: Record<string, unknown>
  }
  export default Prism
}
