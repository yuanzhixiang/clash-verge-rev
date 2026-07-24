import { Box, List, Menu, MenuItem, Paper, ThemeProvider } from '@mui/material'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useTheme as useNextTheme } from 'next-themes'
import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useNavigate } from 'react-router'

import { BaseErrorBoundary, BaseLoading } from '@/components/base'
import { LayoutItem } from '@/components/layout/layout-item'
import { NoticeManager } from '@/components/layout/notice-manager'
import {
  WindowControls,
  WindowResizeHandles,
} from '@/components/layout/window-controller'
import { useI18n } from '@/hooks/use-i18n'
import { useVerge } from '@/hooks/use-verge'
import { useVisibility } from '@/hooks/use-visibility'
import { useWindowDecorations } from '@/hooks/use-window'
import { useThemeMode } from '@/services/states'
import getSystem from '@/utils/get-system'
import { getShellCanvasColor, getShellThemeVars } from '@/utils/shell-theme'

import {
  useCustomTheme,
  useLayoutEvents,
  useLoadingOverlay,
} from './_layout/hooks'
import { handleNoticeMessage } from './_layout/utils'
import {
  navItems,
  preloadLogsPage,
  preloadNavigationRoutes,
} from './_navigation'

import 'dayjs/locale/ru'
import 'dayjs/locale/zh-cn'

const LogsPage = lazy(() => preloadLogsPage())

type MenuContextPosition = { top: number; left: number }

dayjs.extend(relativeTime)

const OS = getSystem()

const Layout = () => {
  const mode = useThemeMode()
  const { t } = useTranslation()
  const { theme } = useCustomTheme()
  const { verge, patchVerge } = useVerge()
  const { language } = verge ?? {}
  const navCollapsed = verge?.collapse_navbar ?? false
  const { switchLanguage } = useI18n()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isLogsPage = pathname === '/logs'
  const pageVisible = useVisibility()
  const themeReady = useMemo(() => Boolean(theme), [theme])

  // 把 MUI 解析出的明暗（palette.mode）同步给 next-themes，
  // 由后者在 <html> 上加/去 .dark class，驱动 tokens.css 的暗色语义层。
  const { setTheme: setNextTheme } = useNextTheme()
  useEffect(() => {
    setNextTheme(theme.palette.mode)
  }, [theme.palette.mode, setNextTheme])

  const [menuContextPosition, setMenuContextPosition] =
    useState<MenuContextPosition | null>(null)

  const windowControlsRef = useRef<any>(null)
  const { decorated } = useWindowDecorations()

  const handleMenuContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setMenuContextPosition({ top: event.clientY, left: event.clientX })
    },
    [],
  )

  const handleMenuContextClose = useCallback(() => {
    setMenuContextPosition(null)
  }, [])

  const handleToggleNavCollapsed = useCallback(() => {
    setMenuContextPosition(null)
    void patchVerge({ collapse_navbar: !navCollapsed })
  }, [navCollapsed, patchVerge])

  const customTitlebar = useMemo(
    () =>
      decorated === false ? (
        <div className="the_titlebar">
          <div
            className="the_titlebar-drag-region"
            data-tauri-drag-region="true"
          />
          <WindowControls ref={windowControlsRef} />
        </div>
      ) : null,
    [decorated],
  )

  useLoadingOverlay(themeReady)

  useEffect(() => {
    if (!themeReady || !pageVisible) {
      return
    }

    const controller = new AbortController()
    void preloadNavigationRoutes(controller.signal)

    return () => {
      controller.abort()
    }
  }, [themeReady, pageVisible])

  const handleNotice = useCallback(
    (payload: [string, string]) => {
      const [status, msg] = payload
      try {
        handleNoticeMessage(status, msg, t, navigate)
      } catch (error) {
        console.error('[通知处理] 失败:', error)
      }
    },
    [t, navigate],
  )

  useLayoutEvents(handleNotice)

  useEffect(() => {
    if (language) {
      dayjs.locale(language === 'zh' ? 'zh-cn' : language)
      switchLanguage(language)
    }
  }, [language, switchLanguage])

  if (!themeReady) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: getShellCanvasColor(mode),
          transition: 'background 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: mode === 'light' ? '#333' : '#fff',
        }}
      ></div>
    )
  }

  return (
    <ThemeProvider theme={theme}>
      {/* 左侧底部窗口控制按钮 */}
      <NoticeManager position={verge?.notice_position} />
      <div
        style={{
          animation: 'fadeIn 0.5s',
          WebkitAnimation: 'fadeIn 0.5s',
        }}
      />
      <style>
        {`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}
      </style>
      <Paper
        square
        elevation={0}
        className={`${OS} layout${navCollapsed ? ' layout--nav-collapsed' : ''}${OS === 'macos' && decorated !== false ? ' layout--native-macos-titlebar' : ''}`}
        style={{
          borderTopLeftRadius: '0px',
          borderTopRightRadius: '0px',
        }}
        onContextMenu={(e) => {
          if (
            OS === 'windows' &&
            !['input', 'textarea'].includes(
              e.currentTarget.tagName.toLowerCase(),
            ) &&
            !e.currentTarget.isContentEditable
          ) {
            e.preventDefault()
          }
        }}
        sx={[
          ({ palette }) => {
            return {
              ...getShellThemeVars(palette),
              bgcolor: 'var(--shell-canvas)',
            }
          },
          OS === 'linux'
            ? {
                borderRadius: 'var(--radius-control)',
                width: '100vw',
                height: '100vh',
              }
            : {},
        ]}
      >
        {decorated === false && <WindowResizeHandles />}

        {/* Custom titlebar - rendered only when decorated is false, memoized for performance */}
        {customTitlebar}

        <div className="layout-content">
          <div className="layout-content__left">
            {OS === 'macos' && decorated !== false && (
              <div
                aria-hidden="true"
                className="macos-titlebar-spacer"
                data-tauri-drag-region="true"
              />
            )}
            <List className="the-menu" onContextMenu={handleMenuContextMenu}>
              {navItems.map((item) => (
                <Fragment key={item.path}>
                  {item.path === '/proxies' && (
                    <Box
                      component="li"
                      className="the-menu__group-label"
                      aria-hidden="true"
                    >
                      {t('layout.components.navigation.groups.proxies')}
                    </Box>
                  )}
                  <LayoutItem
                    to={item.path}
                    icon={item.icon}
                    onPreload={item.preload}
                  >
                    {t(item.label)}
                  </LayoutItem>
                </Fragment>
              ))}
            </List>

            <Menu
              open={Boolean(menuContextPosition)}
              onClose={handleMenuContextClose}
              anchorReference="anchorPosition"
              anchorPosition={
                menuContextPosition
                  ? {
                      top: menuContextPosition.top,
                      left: menuContextPosition.left,
                    }
                  : undefined
              }
              transitionDuration={200}
              slotProps={{
                list: {
                  sx: { py: 0.5 },
                },
              }}
            >
              <MenuItem onClick={handleToggleNavCollapsed} dense>
                {navCollapsed
                  ? t('layout.components.navigation.menu.expandNavBar')
                  : t('layout.components.navigation.menu.collapseNavBar')}
              </MenuItem>
            </Menu>
          </div>

          <div className="layout-content__right">
            <div className="the-bar"></div>
            <div className="the-content">
              {OS === 'macos' && decorated !== false && (
                <div
                  aria-hidden="true"
                  className="macos-content-titlebar"
                  data-tauri-drag-region="true"
                />
              )}
              <div className="the-content-body">
                <BaseErrorBoundary>
                  <Outlet />
                </BaseErrorBoundary>
                {isLogsPage && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                    }}
                  >
                    <Suspense
                      fallback={
                        <Box
                          sx={{
                            display: 'flex',
                            height: '100%',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <BaseLoading />
                        </Box>
                      }
                    >
                      <LogsPage />
                    </Suspense>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Paper>
    </ThemeProvider>
  )
}

export default Layout
