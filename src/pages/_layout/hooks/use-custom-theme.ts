import {
  getCurrentWebviewWindow,
  WebviewWindow,
} from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow, Theme as TauriOsTheme } from '@tauri-apps/api/window'
import { useTheme as useNextTheme } from 'next-themes'
import { useEffect, useMemo } from 'react'

import { useVerge } from '@/hooks/use-verge'
import { defaultDarkTheme, defaultTheme } from '@/pages/_theme'
import { useSetThemeMode, useThemeMode } from '@/services/states'
import getSystem from '@/utils/get-system'

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

// 应用主内容画布色（迁移自 shell-theme.ts，与 tokens.css 的 --color-bg-canvas 一致）
const SHELL_CANVAS_COLOR = { light: '#edf2f7', dark: '#151619' } as const
const getShellCanvasColor = (mode: 'light' | 'dark') => SHELL_CANVAS_COLOR[mode]

// 替代 MUI alpha()：把颜色叠加透明度。命中 #hex 走精确 rgba，其余交给 color-mix。
const withAlpha = (color: string, opacity: number): string => {
  const hex = color.trim()
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
  if (match) {
    let body = match[1]
    if (body.length === 3) {
      body = body
        .split('')
        .map((c) => c + c)
        .join('')
    }
    const r = parseInt(body.slice(0, 2), 16)
    const g = parseInt(body.slice(2, 4), 16)
    const b = parseInt(body.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }
  return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`
}

// 替代 MUI palette.primary.dark：向黑色混合（等价 MUI darken(color, coefficient)）。
const darken = (color: string, coefficient = 0.2): string => {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!match) return color
  let body = match[1]
  if (body.length === 3) {
    body = body
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const scale = (v: number) => Math.round(v * (1 - coefficient))
  const r = scale(parseInt(body.slice(0, 2), 16))
  const g = scale(parseInt(body.slice(2, 4), 16))
  const b = scale(parseInt(body.slice(4, 6), 16))
  const toHex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

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
 * 主题引擎：解析明暗模式、驱动 next-themes 的 .dark class、注入运行时 CSS 变量与
 * 用户自定义样式，并与 Tauri 原生窗口主题保持同步。已完全移除 MUI。
 */
export const useCustomTheme = () => {
  const appWindow: WebviewWindow = useMemo(() => getCurrentWebviewWindow(), [])
  const nativeWindow = useMemo(() => getCurrentWindow(), [])
  const { verge } = useVerge()
  const { theme_mode, theme_setting } = verge ?? {}
  const mode = useThemeMode()
  const setMode = useSetThemeMode()
  const { setTheme: setNextTheme } = useNextTheme()
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

  // 把解析出的明暗同步给 next-themes，由它在 <html> 上加/去 .dark class，
  // 驱动 tokens.css 的暗色语义层。
  useEffect(() => {
    setNextTheme(mode)
  }, [mode, setNextTheme])

  useEffect(() => {
    const shellCanvasColor = getShellCanvasColor(mode)
    const root = document.documentElement
    root.style.setProperty('--bg-color', shellCanvasColor)

    if (OS !== 'macos') {
      return
    }

    nativeWindow.setBackgroundColor(shellCanvasColor).catch((err) => {
      console.error('Failed to sync the macOS window background color:', err)
    })
  }, [mode, nativeWindow])

  // 解析出的品牌主色（含用户自定义），供渐变与 token 覆写复用
  const primaryMain = useMemo(() => {
    const dt = mode === 'light' ? defaultTheme : defaultDarkTheme
    return theme_setting?.primary_color || dt.primary_color
  }, [mode, theme_setting])
  const primaryDark = useMemo(() => darken(primaryMain, 0.2), [primaryMain])

  // 运行时 CSS 变量注入 + 用户自定义主题色覆写 + 自定义 CSS 注入
  useEffect(() => {
    const setting = theme_setting || {}
    const dt = mode === 'light' ? defaultTheme : defaultDarkTheme
    const rootEle = document.documentElement
    if (!rootEle) return

    const backgroundColor = getShellCanvasColor(mode)
    const selectColor = mode === 'light' ? '#f5f5f5' : '#3E3E3E'
    const scrollColor = mode === 'light' ? '#7d87934d' : '#8d929b66'
    const dividerColor =
      mode === 'light' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)'

    rootEle.style.setProperty('--divider-color', dividerColor)
    rootEle.style.setProperty('--background-color', backgroundColor)
    rootEle.style.setProperty('--selection-color', selectColor)
    rootEle.style.setProperty('--scroller-color', scrollColor)
    rootEle.style.setProperty('--primary-main', primaryMain)
    rootEle.style.setProperty(
      '--background-color-alpha',
      withAlpha(primaryMain, 0.1),
    )
    rootEle.style.setProperty(
      '--window-border-color',
      mode === 'light' ? 'rgba(31, 35, 40, 0.1)' : 'rgba(255, 255, 255, 0.1)',
    )
    rootEle.style.setProperty('--scrollbar-bg', 'transparent')
    rootEle.style.setProperty('--scrollbar-thumb', scrollColor)

    // 用户自定义主题色 → 覆写语义 token（缺省即回落 tokens.css 默认值）
    rootEle.style.setProperty('--color-accent', primaryMain)
    rootEle.style.setProperty('--color-accent-hover', primaryDark)
    rootEle.style.setProperty('--color-accent-strong', primaryDark)
    rootEle.style.setProperty('--color-focus-ring', primaryMain)
    rootEle.style.setProperty(
      '--color-accent-subtle',
      withAlpha(primaryMain, mode === 'light' ? 0.1 : 0.14),
    )
    rootEle.style.setProperty(
      '--color-text-primary',
      setting.primary_text || dt.primary_text,
    )
    rootEle.style.setProperty(
      '--color-text-secondary',
      setting.secondary_text || dt.secondary_text,
    )
    rootEle.style.setProperty(
      '--color-secondary',
      setting.secondary_color || dt.secondary_color,
    )
    rootEle.style.setProperty(
      '--color-info',
      setting.info_color || dt.info_color,
    )
    rootEle.style.setProperty(
      '--color-danger',
      setting.error_color || dt.error_color,
    )
    rootEle.style.setProperty(
      '--color-warning',
      setting.warning_color || dt.warning_color,
    )
    rootEle.style.setProperty(
      '--color-success',
      setting.success_color || dt.success_color,
    )
    if (setting.font_family) {
      rootEle.style.setProperty(
        '--font-sans',
        `${setting.font_family}, ${dt.font_family}`,
      )
    } else {
      rootEle.style.removeProperty('--font-sans')
    }

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

        :where(button, [role='button'], [tabindex]:not(input):not(textarea):not(select)):focus-visible {
          outline: 2px solid ${withAlpha(primaryMain, 0.72)} !important;
          outline-offset: 2px;
        }
      `

      styleElement.innerHTML = effectiveInjectedCss + globalStyles
    }
  }, [
    mode,
    theme_setting,
    userBackgroundImage,
    hasUserBackground,
    primaryMain,
    primaryDark,
  ])

  // #Gradient2 SVG 渐变（原依赖 MUI palette.primary.main/dark）
  useEffect(() => {
    const id = setTimeout(() => {
      const dom = document.querySelector('#Gradient2')
      if (dom) {
        dom.innerHTML = `
        <stop offset="0%" stop-color="${primaryMain}" />
        <stop offset="80%" stop-color="${primaryDark}" />
        <stop offset="100%" stop-color="${primaryDark}" />
        `
      }
    }, 0)
    return () => clearTimeout(id)
  }, [primaryMain, primaryDark])

  // theme 已由 tokens.css + next-themes 接管，主题始终就绪
  return { themeReady: Boolean(mode) }
}
