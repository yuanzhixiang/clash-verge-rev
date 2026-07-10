import { alpha } from '@mui/material'
import type { Palette } from '@mui/material/styles'

export type ShellThemeVars = Record<`--shell-${string}`, string>

export const getShellThemeVars = (palette: Palette): ShellThemeVars => {
  const isDarkMode = palette.mode === 'dark'

  return {
    '--shell-canvas': isDarkMode ? '#151619' : '#edf2f7',
    '--shell-sidebar': isDarkMode
      ? 'rgba(21, 22, 25, 0.96)'
      : 'rgba(237, 242, 247, 0.94)',
    '--shell-panel': isDarkMode ? '#1d1e22' : '#fbfcfd',
    '--shell-panel-muted': isDarkMode ? '#222328' : '#f1f4f7',
    '--shell-border': isDarkMode
      ? 'rgba(255, 255, 255, 0.08)'
      : 'rgba(31, 35, 40, 0.09)',
    '--shell-border-strong': isDarkMode
      ? 'rgba(255, 255, 255, 0.13)'
      : 'rgba(31, 35, 40, 0.14)',
    '--shell-nav-hover': alpha(palette.text.primary, 0.055),
    '--shell-nav-selected': alpha(palette.text.primary, 0.1),
    '--shell-focus': palette.primary.main,
    '--shell-shadow': isDarkMode
      ? '0 18px 45px rgba(0, 0, 0, 0.26)'
      : '0 18px 45px rgba(55, 70, 90, 0.12)',
  }
}
