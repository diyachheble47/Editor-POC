// three.js (r128, the global build) plus the T3 kit, for interactive HTML blocks. A model-written page just uses
// `THREE` / `T3`; the frame can't fetch scripts (CSP), so the editor puts this copy inside the page instead.
// Loaded on demand: ~600 KB is only fetched when a block actually uses it.
let cached: Promise<string> | null = null
export function loadThree(): Promise<string> {
  cached ??= Promise.all([import('./vendor/three.r128.min.js?raw'), import('./vendor/t3kit.js?raw')]).then(
    ([three, kit]) => `${three.default}\n;${kit.default}`,
  )
  return cached
}
