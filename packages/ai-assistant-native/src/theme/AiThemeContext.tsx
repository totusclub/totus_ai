import { createContext, useContext, useMemo, type ReactNode } from 'react'
import {
  getAiColors,
  type AiColorScheme,
  type AiColors,
  lightColors,
} from '@/theme/colors'

type AiThemeContextValue = {
  colorScheme: AiColorScheme
  colors: AiColors
  isDark: boolean
}

const AiThemeContext = createContext<AiThemeContextValue>({
  colorScheme: 'light',
  colors: lightColors,
  isDark: false,
})

export function AiThemeProvider({
  colorScheme = 'light',
  children,
}: {
  colorScheme?: AiColorScheme
  children: ReactNode
}) {
  const value = useMemo<AiThemeContextValue>(() => {
    const colors = getAiColors(colorScheme)
    return {
      colorScheme,
      colors,
      isDark: colorScheme === 'dark',
    }
  }, [colorScheme])

  return <AiThemeContext.Provider value={value}>{children}</AiThemeContext.Provider>
}

export function useAiTheme(): AiThemeContextValue {
  return useContext(AiThemeContext)
}
