import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'tnb-theme'

function read(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* storage blocked: fall through */ }
  return 'light'
}

interface ThemeValue {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeValue>({ theme: 'light', setTheme: () => {}, toggle: () => {} })

/**
 * Light or dark. The choice is saved in the browser and applied as
 * <html data-theme>; tokens.css holds the colours for each. index.html applies
 * the saved value before React starts, so there is no flash of the wrong theme.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(read)

  // useLayoutEffect, not useEffect: passive effects of children (e.g. the graph
  // block reading CSS colour tokens while it redraws) run before the parent's
  // passive effects, so the attribute must be set before those run.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    try { localStorage.setItem(KEY, theme) } catch { /* not saved, still applied */ }
  }, [theme])

  const setTheme = useCallback((t: Theme) => setThemeState(t), [])
  const toggle = useCallback(() => setThemeState(t => (t === 'dark' ? 'light' : 'dark')), [])
  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeValue {
  return useContext(ThemeContext)
}
