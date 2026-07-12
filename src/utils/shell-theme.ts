import { alpha } from '@mui/material'
import type { Palette } from '@mui/material/styles'

export type ShellThemeVars = Record<`--shell-${string}`, string>

export const SHELL_CANVAS_COLORS = {
  light: '#edf2f7',
  dark: '#151619',
} as const

export const getShellCanvasColor = (mode: Palette['mode']) =>
  SHELL_CANVAS_COLORS[mode]

export const getShellThemeVars = (palette: Palette): ShellThemeVars => {
  const isDarkMode = palette.mode === 'dark'

  return {
    '--shell-canvas': getShellCanvasColor(palette.mode),
    '--shell-sidebar': isDarkMode
      ? 'rgba(21, 22, 25, 0.96)'
      : 'rgba(237, 242, 247, 0.94)',
    '--shell-panel': isDarkMode ? '#1b1c20' : '#fbfcfd',
    '--shell-panel-muted': isDarkMode ? '#232429' : '#f2f5f8',
    '--shell-card': isDarkMode ? '#232429' : '#ffffff',
    '--shell-border': isDarkMode
      ? 'rgba(255, 255, 255, 0.08)'
      : 'rgba(31, 35, 40, 0.09)',
    '--shell-border-strong': isDarkMode
      ? 'rgba(255, 255, 255, 0.13)'
      : 'rgba(31, 35, 40, 0.14)',
    '--shell-nav-hover': alpha(palette.text.primary, 0.05),
    '--shell-nav-selected': alpha(palette.text.primary, 0.085),
    '--shell-focus': palette.primary.main,
    '--shell-shadow': isDarkMode
      ? '0 18px 48px rgba(0, 0, 0, 0.3)'
      : '0 18px 48px rgba(55, 70, 90, 0.11)',
  }
}
