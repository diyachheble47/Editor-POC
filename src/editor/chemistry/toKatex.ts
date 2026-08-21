// The only bridge between our chemistry engine and the rendering layer
// (KaTeX + mhchem). Kept as one small function so the renderer could be
// swapped later (e.g. for MathJax) without touching the parser/balancer.

export function toKatexSource(rawInput: string): string {
  const trimmed = rawInput.trim()
  if (trimmed.startsWith('\\')) return trimmed // already raw LaTeX, leave as-is
  return `\\ce{${trimmed}}`
}
