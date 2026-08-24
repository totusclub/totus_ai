export type AiColorScheme = 'light' | 'dark'

export type AiColors = {
  paper: string
  page: string
  sand: string
  ink: string
  subtle: string
  faint: string
  line: string
  coral: string
  coralDeep: string
  sea: string
  seaSoft: string
  gold: string
  ok: string
  white: string
  userBubble: string
  userBubbleText: string
  overlay: string
}

export const lightColors: AiColors = {
  paper: '#ffffff',
  page: '#f5f6f8',
  sand: '#f3f5f7',
  ink: '#1f1f1f',
  subtle: '#6b7280',
  faint: '#9ca3af',
  line: '#e6e8eb',
  coral: '#fe732e',
  coralDeep: '#ea5f1a',
  sea: '#35a8e0',
  seaSoft: '#e8f4fc',
  gold: '#f0a92c',
  ok: '#16a34a',
  white: '#ffffff',
  userBubble: '#1f1f1f',
  userBubbleText: '#ffffff',
  overlay: 'rgba(31,31,31,0.35)',
}

export const darkColors: AiColors = {
  paper: '#121212',
  page: '#1a1a1a',
  sand: '#242424',
  ink: '#f5f5f5',
  subtle: '#b0b0b0',
  faint: '#808080',
  line: '#3a3a3a',
  coral: '#fe732e',
  coralDeep: '#ea5f1a',
  sea: '#4db8e8',
  seaSoft: '#1a2f3a',
  gold: '#f0a92c',
  ok: '#22c55e',
  white: '#ffffff',
  userBubble: '#fe732e',
  userBubbleText: '#ffffff',
  overlay: 'rgba(0,0,0,0.45)',
}

export function getAiColors(scheme: AiColorScheme): AiColors {
  return scheme === 'dark' ? darkColors : lightColors
}

/** @deprecated use getAiColors / useAiTheme — kept for gradual migration */
export const colors = lightColors
