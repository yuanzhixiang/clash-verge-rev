import { alpha, createTheme, Theme as MuiTheme, Shadows } from '@mui/material'
import {
  getCurrentWebviewWindow,
  WebviewWindow,
} from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow, Theme as TauriOsTheme } from '@tauri-apps/api/window'
import { useEffect, useMemo } from 'react'

import { useVerge } from '@/hooks/use-verge'
import { defaultDarkTheme, defaultTheme } from '@/pages/_theme'
import { useSetThemeMode, useThemeMode } from '@/services/states'
import getSystem from '@/utils/get-system'
import { getShellCanvasColor } from '@/utils/shell-theme'

const CSS_INJECTION_SCOPE_ROOT = '[data-css-injection-root]'
const CSS_INJECTION_SCOPE_LIMIT =
  ':is(.monaco-editor .view-lines, .monaco-editor .view-line, .monaco-editor .margin, .monaco-editor .margin-view-overlays, .monaco-editor .view-overlays, .monaco-editor [class^="mtk"], .monaco-editor [class*=" mtk"])'
const TOP_LEVEL_AT_RULES = [
  '@charset',
  '@import',
  '@namespace',
  '@font-face',
  '@keyframes',
  '@counter-style',
  '@page',
  '@property',
  '@font-feature-values',
  '@color-profile',
]
let cssScopeSupport: boolean | null = null
const OS = getSystem()

const canUseCssScope = () => {
  if (cssScopeSupport !== null) {
    return cssScopeSupport
  }
  try {
    const testStyle = document.createElement('style')
    testStyle.textContent = '@scope (:root) { }'
    document.head.appendChild(testStyle)
    cssScopeSupport = !!testStyle.sheet?.cssRules?.length
    document.head.removeChild(testStyle)
  } catch {
    cssScopeSupport = false
  }
  return cssScopeSupport
}

const wrapCssInjectionWithScope = (css?: string) => {
  if (!css?.trim()) {
    return ''
  }
  const lowerCss = css.toLowerCase()
  const hasTopLevelOnlyRule = TOP_LEVEL_AT_RULES.some((rule) =>
    lowerCss.includes(rule),
  )
  if (hasTopLevelOnlyRule) {
    return null
  }
  const scopeRoot = CSS_INJECTION_SCOPE_ROOT
  const scopeLimit = CSS_INJECTION_SCOPE_LIMIT
  const scopedBlock = `@scope (${scopeRoot}) to (${scopeLimit}) {
${css}
}`
  return scopedBlock
}

/**
 * custom theme
 */
export const useCustomTheme = () => {
  const appWindow: WebviewWindow = useMemo(() => getCurrentWebviewWindow(), [])
  const nativeWindow = useMemo(() => getCurrentWindow(), [])
  const { verge } = useVerge()
  const { theme_mode, theme_setting } = verge ?? {}
  const mode = useThemeMode()
  const setMode = useSetThemeMode()
  const userBackgroundImage = theme_setting?.background_image || ''
  const hasUserBackground = !!userBackgroundImage

  useEffect(() => {
    if (theme_mode === 'light' || theme_mode === 'dark') {
      setMode(theme_mode)
    }
  }, [theme_mode, setMode])

  useEffect(() => {
    if (theme_mode !== 'system') {
      return
    }

    let isMounted = true

    const timerId = setTimeout(() => {
      if (!isMounted) return
      appWindow
        .theme()
        .then((systemTheme) => {
          if (isMounted && systemTheme) {
            setMode(systemTheme)
          }
        })
        .catch((err) => {
          console.error('Failed to get initial system theme:', err)
        })
    }, 0)

    const unlistenPromise = appWindow.onThemeChanged(({ payload }) => {
      if (isMounted) {
        setMode(payload)
      }
    })

    return () => {
      isMounted = false
      clearTimeout(timerId)
      unlistenPromise
        .then((unlistenFn) => {
          if (typeof unlistenFn === 'function') {
            unlistenFn()
          }
        })
        .catch((err) => {
          console.error('Failed to unlisten from theme changes:', err)
        })
    }
  }, [theme_mode, appWindow, setMode])

  useEffect(() => {
    if (theme_mode === undefined) {
      return
    }

    if (theme_mode === 'system') {
      appWindow.setTheme(null).catch((err) => {
        console.error(
          'Failed to set window theme to follow system (setTheme(null)):',
          err,
        )
      })
    } else if (mode) {
      appWindow.setTheme(mode as TauriOsTheme).catch((err) => {
        console.error(`Failed to set window theme to ${mode}:`, err)
      })
    }
  }, [mode, appWindow, theme_mode])

  useEffect(() => {
    const shellCanvasColor = getShellCanvasColor(mode)
    const root = document.documentElement
    root.style.setProperty('--bg-color', shellCanvasColor)
    root.style.setProperty('--shell-canvas', shellCanvasColor)

    if (OS !== 'macos') {
      return
    }

    nativeWindow.setBackgroundColor(shellCanvasColor).catch((err) => {
      console.error('Failed to sync the macOS window background color:', err)
    })
  }, [mode, nativeWindow])

  const theme = useMemo(() => {
    const setting = theme_setting || {}
    const dt = mode === 'light' ? defaultTheme : defaultDarkTheme
    let muiTheme: MuiTheme

    try {
      muiTheme = createTheme({
        shape: {
          borderRadius: 9,
        },
        components: {
          MuiButtonBase: {
            defaultProps: {
              disableRipple: true,
            },
          },
          MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: {
              root: {
                minHeight: 36,
                borderRadius: 'var(--radius-control)',
                paddingInline: 14,
                fontSize: 13.5,
                fontWeight: 550,
                letterSpacing: 0,
                textTransform: 'none',
              },
              contained: {
                boxShadow: 'none',
              },
              outlined: {
                borderColor:
                  mode === 'light'
                    ? 'rgba(31, 35, 40, 0.14)'
                    : 'rgba(255, 255, 255, 0.14)',
              },
            },
          },
          MuiIconButton: {
            styleOverrides: {
              root: {
                borderRadius: 'var(--radius-control)',
                transition: 'background-color 160ms ease, color 160ms ease',
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              rounded: { borderRadius: 'var(--radius-container)' },
            },
          },
          MuiCard: {
            styleOverrides: {
              root: { borderRadius: 'var(--radius-container)' },
            },
          },
          MuiChip: {
            styleOverrides: {
              root: { borderRadius: 'var(--radius-pill)' },
            },
          },
          MuiDialog: {
            styleOverrides: {
              paper: {
                border:
                  mode === 'light'
                    ? '1px solid rgba(31, 35, 40, 0.1)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 'var(--radius-overlay)',
                boxShadow:
                  mode === 'light'
                    ? '0 28px 80px rgba(25, 35, 48, 0.2)'
                    : '0 28px 80px rgba(0, 0, 0, 0.45)',
              },
            },
          },
          MuiDialogTitle: {
            styleOverrides: {
              root: {
                padding: '22px 24px 12px',
                fontSize: 20,
                fontWeight: 650,
                letterSpacing: '-0.025em',
              },
            },
          },
          MuiDialogContent: {
            styleOverrides: { root: { paddingInline: 24 } },
          },
          MuiDialogActions: {
            styleOverrides: { root: { padding: '16px 24px 22px', gap: 8 } },
          },
          MuiTextField: {
            defaultProps: { size: 'small' },
          },
          MuiOutlinedInput: {
            styleOverrides: {
              root: {
                borderRadius: 'var(--radius-control)',
                backgroundColor:
                  mode === 'light'
                    ? 'rgba(255, 255, 255, 0.76)'
                    : 'rgba(255, 255, 255, 0.035)',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor:
                    mode === 'light'
                      ? 'rgba(31, 35, 40, 0.13)'
                      : 'rgba(255, 255, 255, 0.13)',
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor:
                    mode === 'light'
                      ? 'rgba(31, 35, 40, 0.22)'
                      : 'rgba(255, 255, 255, 0.22)',
                },
              },
            },
          },
          MuiSwitch: {
            styleOverrides: {
              root: { padding: 8 },
              switchBase: { padding: 10 },
              thumb: { width: 16, height: 16, boxShadow: 'none' },
              track: { borderRadius: 'var(--radius-pill)', opacity: 0.16 },
            },
          },
          MuiMenu: {
            styleOverrides: {
              paper: { borderRadius: 'var(--radius-overlay)' },
            },
          },
          MuiPopover: {
            styleOverrides: {
              paper: { borderRadius: 'var(--radius-overlay)' },
            },
          },
          MuiTooltip: {
            styleOverrides: {
              tooltip: {
                borderRadius: 'var(--radius-compact)',
                fontSize: 12,
                padding: '6px 9px',
              },
            },
          },
        },
        breakpoints: {
          values: { xs: 0, sm: 650, md: 900, lg: 1200, xl: 1536 },
        },
        palette: {
          mode,
          primary: { main: setting.primary_color || dt.primary_color },
          secondary: { main: setting.secondary_color || dt.secondary_color },
          info: { main: setting.info_color || dt.info_color },
          error: { main: setting.error_color || dt.error_color },
          warning: { main: setting.warning_color || dt.warning_color },
          success: { main: setting.success_color || dt.success_color },
          text: {
            primary: setting.primary_text || dt.primary_text,
            secondary: setting.secondary_text || dt.secondary_text,
          },
          background: {
            paper: dt.background_color,
            default: dt.background_color,
          },
        },
        shadows: Array(25).fill('none') as Shadows,
        typography: {
          fontFamily: setting.font_family
            ? `${setting.font_family}, ${dt.font_family}`
            : dt.font_family,
          button: { textTransform: 'none' },
        },
      })
    } catch (e) {
      console.error('Error creating MUI theme, falling back to defaults:', e)
      muiTheme = createTheme({
        components: {
          MuiButtonBase: {
            defaultProps: {
              disableRipple: true,
            },
          },
        },
        breakpoints: {
          values: { xs: 0, sm: 650, md: 900, lg: 1200, xl: 1536 },
        },
        palette: {
          mode,
          primary: { main: dt.primary_color },
          secondary: { main: dt.secondary_color },
          info: { main: dt.info_color },
          error: { main: dt.error_color },
          warning: { main: dt.warning_color },
          success: { main: dt.success_color },
          text: { primary: dt.primary_text, secondary: dt.secondary_text },
          background: {
            paper: dt.background_color,
            default: dt.background_color,
          },
        },
        typography: { fontFamily: dt.font_family },
      })
    }

    const rootEle = document.documentElement
    if (rootEle) {
      const backgroundColor = getShellCanvasColor(mode)
      const selectColor = mode === 'light' ? '#f5f5f5' : '#3E3E3E'
      const scrollColor = mode === 'light' ? '#7d87934d' : '#8d929b66'
      const dividerColor =
        mode === 'light' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)'
      rootEle.style.setProperty('--divider-color', dividerColor)
      rootEle.style.setProperty('--background-color', backgroundColor)
      rootEle.style.setProperty('--selection-color', selectColor)
      rootEle.style.setProperty('--scroller-color', scrollColor)
      rootEle.style.setProperty('--primary-main', muiTheme.palette.primary.main)
      rootEle.style.setProperty(
        '--background-color-alpha',
        alpha(muiTheme.palette.primary.main, 0.1),
      )
      rootEle.style.setProperty(
        '--window-border-color',
        mode === 'light' ? 'rgba(31, 35, 40, 0.1)' : 'rgba(255, 255, 255, 0.1)',
      )
      rootEle.style.setProperty('--scrollbar-bg', 'transparent')
      rootEle.style.setProperty('--scrollbar-thumb', scrollColor)
      rootEle.style.setProperty(
        '--user-background-image',
        hasUserBackground ? `url('${userBackgroundImage}')` : 'none',
      )
      rootEle.style.setProperty(
        '--background-blend-mode',
        setting.background_blend_mode || 'normal',
      )
      rootEle.style.setProperty(
        '--background-opacity',
        setting.background_opacity !== undefined
          ? String(setting.background_opacity)
          : '1',
      )
      rootEle.setAttribute('data-css-injection-root', 'true')
    }

    let styleElement = document.querySelector('style#verge-theme')
    if (!styleElement) {
      styleElement = document.createElement('style')
      styleElement.id = 'verge-theme'
      document.head.appendChild(styleElement!)
    }

    if (styleElement) {
      let scopedCss: string | null = null
      if (canUseCssScope() && setting.css_injection) {
        scopedCss = wrapCssInjectionWithScope(setting.css_injection)
      }
      const effectiveInjectedCss = scopedCss ?? setting.css_injection ?? ''
      const globalStyles = `
        /* 修复滚动条样式 */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
          background-color: var(--scrollbar-bg);
        }
        ::-webkit-scrollbar-thumb {
          background-color: var(--scrollbar-thumb);
          border-radius: var(--radius-compact);
        }
        ::-webkit-scrollbar-thumb:hover {
          background-color: ${mode === 'light' ? '#a1a1a1' : '#666666'};
        }

        /* 背景图处理 */
        body {
          background-color: var(--background-color);
          ${
            hasUserBackground
              ? `
            background-image: var(--user-background-image);
            background-size: cover;
            background-position: center;
            background-attachment: fixed;
            background-blend-mode: var(--background-blend-mode);
            opacity: var(--background-opacity);
          `
              : ''
          }
        }

        /* 确保模态框和对话框也使用暗色主题 */
        .MuiDialog-paper {
          background-color: ${mode === 'light' ? '#ffffff' : '#232429'} !important;
        }

        :where(button, [role='button'], [tabindex]:not(input):not(textarea):not(select)):focus-visible {
          outline: 2px solid ${alpha(muiTheme.palette.primary.main, 0.72)} !important;
          outline-offset: 2px;
        }
      `

      styleElement.innerHTML = effectiveInjectedCss + globalStyles
    }

    return muiTheme
  }, [mode, theme_setting, userBackgroundImage, hasUserBackground])

  useEffect(() => {
    const id = setTimeout(() => {
      const dom = document.querySelector('#Gradient2')
      if (dom) {
        dom.innerHTML = `
        <stop offset="0%" stop-color="${theme.palette.primary.main}" />
        <stop offset="80%" stop-color="${theme.palette.primary.dark}" />
        <stop offset="100%" stop-color="${theme.palette.primary.dark}" />
        `
      }
    }, 0)
    return () => clearTimeout(id)
  }, [theme.palette.primary.main, theme.palette.primary.dark])

  return { theme }
}
