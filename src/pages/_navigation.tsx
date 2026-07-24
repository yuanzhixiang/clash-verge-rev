import {
  AlignLeft,
  Globe,
  House,
  ListChecks,
  LockOpen,
  Server,
  Settings,
  Split,
} from 'lucide-react'
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'

import ConnectionsSvg from '@/assets/image/itemicon/connections.svg?react'
import HomeSvg from '@/assets/image/itemicon/home.svg?react'
import LogsSvg from '@/assets/image/itemicon/logs.svg?react'
import ProfilesSvg from '@/assets/image/itemicon/profiles.svg?react'
import SettingsSvg from '@/assets/image/itemicon/settings.svg?react'
import UnlockSvg from '@/assets/image/itemicon/unlock.svg?react'
import { BaseLoading } from '@/components/base'
import { ensureLanguageSections } from '@/services/i18n'

import { navigationItems } from './_navigation-meta'
import HomePage from './home'

type NavigationItem = {
  label: (typeof navigationItems)[keyof typeof navigationItems]['label']
  path: string
  icon: ReactNode[]
  Component: ComponentType
  preload?: () => Promise<{ default: ComponentType }>
}

const waitForWarmupIdle = (signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    let idleId: number | undefined
    let timeoutId: number | undefined

    const cleanup = () => {
      signal.removeEventListener('abort', finish)
      if (idleId !== undefined) {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }

    const finish = () => {
      cleanup()
      resolve()
    }

    if (signal.aborted) {
      resolve()
      return
    }

    signal.addEventListener('abort', finish, { once: true })

    if (window.requestIdleCallback) {
      idleId = window.requestIdleCallback(finish, { timeout: 500 })
    } else {
      timeoutId = window.setTimeout(finish, 120)
    }
  })

const createRoutePreload = (
  load: () => Promise<{ default: ComponentType }>,
  sections?: string | readonly string[],
) => {
  let componentPromise: Promise<{ default: ComponentType }> | undefined

  const loadComponent = () => {
    componentPromise ??= load().catch((error) => {
      componentPromise = undefined
      throw error
    })

    return componentPromise
  }

  if (!sections) {
    return loadComponent
  }

  return async () => {
    const [component] = await Promise.all([
      loadComponent(),
      ensureLanguageSections(sections),
    ])
    return component
  }
}

const createLazyRoute = (
  load: () => Promise<{ default: ComponentType }>,
  sections?: string | readonly string[],
) => {
  const preload = createRoutePreload(load, sections)
  const Component = lazy(preload)
  const LazyRoute = () => (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <BaseLoading />
        </div>
      }
    >
      <Component />
    </Suspense>
  )

  return { Component: LazyRoute, preload }
}

export const preloadLogsPage = createRoutePreload(
  () => import('./logs'),
  'logs',
)

export const navItems: NavigationItem[] = [
  {
    ...navigationItems.home,
    icon: [<House key="mui" />, <HomeSvg key="svg" />],
    Component: HomePage,
  },
  {
    ...navigationItems.proxies,
    icon: [<Split key="mui" />, <Split key="color" />],
    ...createLazyRoute(() => import('./proxies')),
  },
  {
    ...navigationItems.profiles,
    icon: [<Server key="mui" />, <ProfilesSvg key="svg" />],
    ...createLazyRoute(() => import('./profiles'), 'rules'),
  },
  {
    ...navigationItems.connections,
    icon: [<Globe key="mui" />, <ConnectionsSvg key="svg" />],
    ...createLazyRoute(() => import('./connections'), 'connections'),
  },
  {
    ...navigationItems.rules,
    icon: [<ListChecks key="mui" />, <ListChecks key="color" />],
    ...createLazyRoute(() => import('./rules'), 'rules'),
  },
  {
    ...navigationItems.logs,
    icon: [<AlignLeft key="mui" />, <LogsSvg key="svg" />],
    Component: () => null /* LogsPage rendered in Layout only on /logs route */,
    preload: preloadLogsPage,
  },
  {
    ...navigationItems.unlock,
    icon: [<LockOpen key="mui" />, <UnlockSvg key="svg" />],
    ...createLazyRoute(() => import('./unlock')),
  },
  {
    ...navigationItems.settings,
    icon: [<Settings key="mui" />, <SettingsSvg key="svg" />],
    ...createLazyRoute(() => import('./settings')),
  },
]

export const preloadNavigationRoutes = async (signal: AbortSignal) => {
  await waitForWarmupIdle(signal)
  if (signal.aborted) {
    return
  }

  await Promise.all(
    navItems.map((item) => {
      const preload = 'preload' in item ? item.preload : undefined
      return preload?.().catch(() => {})
    }),
  )
}
