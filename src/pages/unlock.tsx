import { invoke } from '@tauri-apps/api/core'
import { useLockFn } from 'ahooks'
import {
  CircleCheck,
  CircleEllipsis,
  CircleHelp,
  CircleX,
  Clock,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseEmpty, BasePage } from '@/components/base'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { showNotice } from '@/services/notice-service'

interface UnlockItem {
  name: string
  status: string
  region?: string | null
  check_time?: string | null
}

const UNLOCK_RESULTS_STORAGE_KEY = 'clash_verge_unlock_results'
const UNLOCK_RESULTS_TIME_KEY = 'clash_verge_unlock_time'

const STATUS_LABEL_KEYS: Record<string, string> = {
  Pending: 'tests.statuses.test.pending',
  Yes: 'tests.statuses.test.yes',
  No: 'tests.statuses.test.no',
  Failed: 'tests.statuses.test.failed',
  Completed: 'tests.statuses.test.completed',
  'Disallowed ISP': 'tests.statuses.test.disallowedIsp',
  'Originals Only': 'tests.statuses.test.originalsOnly',
  'No (IP Banned By Disney+)': 'tests.statuses.test.noDisney',
  'Unsupported Country/Region': 'tests.statuses.test.unsupportedRegion',
  'Failed (Network Connection)': 'tests.statuses.test.failedNetwork',
}

const normalizeUnlockName = (name: string) => name.trim().toLowerCase()

const getStatusPriority = (status: string) => (status === 'Pending' ? 0 : 1)
const mergeOptionalFields = (preferred: UnlockItem, fallback: UnlockItem) => ({
  ...preferred,
  region: preferred.region ?? fallback.region,
  check_time: preferred.check_time ?? fallback.check_time,
})

const dedupeUnlockItems = (items: UnlockItem[]) => {
  const map = new Map<string, UnlockItem>()

  items.forEach((item) => {
    const key = normalizeUnlockName(item.name)
    const existing = map.get(key)

    if (!existing) {
      map.set(key, item)
      return
    }

    const existingPriority = getStatusPriority(existing.status)
    const itemPriority = getStatusPriority(item.status)

    if (itemPriority > existingPriority) {
      map.set(key, mergeOptionalFields(item, existing))
      return
    }

    if (itemPriority < existingPriority) {
      map.set(key, mergeOptionalFields(existing, item))
      return
    }

    map.set(key, mergeOptionalFields(item, existing))
  })

  return Array.from(map.values())
}

type StatusColor = 'default' | 'success' | 'error' | 'warning' | 'info'

// 状态颜色分类
const getStatusColor = (status: string): StatusColor => {
  if (status === 'Pending') return 'default'
  if (status === 'Yes') return 'success'
  if (status === 'No') return 'error'
  if (status === 'Soon') return 'warning'
  if (status.includes('Failed')) return 'error'
  if (status === 'Completed') return 'info'
  if (
    status === 'Disallowed ISP' ||
    status === 'Blocked' ||
    status === 'Unsupported Country/Region'
  ) {
    return 'error'
  }
  return 'default'
}

const STATUS_BADGE_CLASS: Record<StatusColor, string> = {
  default:
    'bg-[color-mix(in_srgb,var(--color-text-primary)_8%,transparent)] text-[var(--color-text-secondary)]',
  success: 'bg-[var(--color-success-subtle)] text-[var(--color-success)]',
  error: 'bg-[var(--color-danger-subtle)] text-[var(--color-danger)]',
  warning: 'bg-[var(--color-warning-subtle)] text-[var(--color-warning)]',
  info: 'bg-[var(--color-info-subtle)] text-[var(--color-info)]',
}

// 状态图标
const getStatusIcon = (status: string) => {
  if (status === 'Pending') return <CircleEllipsis />
  if (status === 'Yes') return <CircleCheck />
  if (status === 'No') return <CircleX />
  if (status === 'Soon') return <Clock />
  if (status.includes('Failed')) return <CircleHelp />
  return <CircleHelp />
}

// 边框色（左侧状态条）
const getStatusBorderColor = (status: string) => {
  if (status === 'Yes') return 'var(--color-success)'
  if (status === 'No') return 'var(--color-danger)'
  if (status === 'Soon') return 'var(--color-warning)'
  if (status.includes('Failed')) return 'var(--color-danger)'
  if (status === 'Completed') return 'var(--color-info)'
  return 'var(--color-border)'
}

const UnlockPage = () => {
  const { t } = useTranslation()

  const [unlockItems, setUnlockItems] = useState<UnlockItem[]>([])
  const [isCheckingAll, setIsCheckingAll] = useState(false)
  const [loadingItems, setLoadingItems] = useState<string[]>([])

  const sortItemsByName = useCallback((items: UnlockItem[]) => {
    return [...items].sort((a, b) => a.name.localeCompare(b.name))
  }, [])

  const mergeUnlockItems = useCallback(
    (defaults: UnlockItem[], existing?: UnlockItem[] | null) => {
      if (!existing || existing.length === 0) {
        return defaults
      }

      const normalizedExisting = dedupeUnlockItems(existing)
      const existingMap = new Map(
        normalizedExisting.map((item) => [
          normalizeUnlockName(item.name),
          item,
        ]),
      )
      const merged = defaults.map((item) => {
        const normalizedName = normalizeUnlockName(item.name)
        const matchedItem = existingMap.get(normalizedName)
        if (matchedItem) {
          return { ...matchedItem, name: item.name }
        }
        return item
      })

      const mergedNameSet = new Set(
        merged.map((item) => normalizeUnlockName(item.name)),
      )
      normalizedExisting.forEach((item) => {
        const normalizedName = normalizeUnlockName(item.name)
        if (!mergedNameSet.has(normalizedName)) {
          merged.push(item)
          mergedNameSet.add(normalizedName)
        }
      })

      return merged
    },
    [],
  )

  // 保存测试结果到本地存储
  const saveResultsToStorage = useCallback(
    (items: UnlockItem[], time: string | null) => {
      try {
        localStorage.setItem(UNLOCK_RESULTS_STORAGE_KEY, JSON.stringify(items))
        if (time) {
          localStorage.setItem(UNLOCK_RESULTS_TIME_KEY, time)
        }
      } catch (err) {
        console.error('Failed to save results to storage:', err)
      }
    },
    [],
  )

  const loadResultsFromStorage = useCallback((): {
    items: UnlockItem[] | null
    time: string | null
  } => {
    try {
      const itemsJson = localStorage.getItem(UNLOCK_RESULTS_STORAGE_KEY)
      const time = localStorage.getItem(UNLOCK_RESULTS_TIME_KEY)

      if (itemsJson) {
        const parsedItems = JSON.parse(itemsJson) as UnlockItem[]
        return {
          items: dedupeUnlockItems(parsedItems),
          time,
        }
      }
    } catch (err) {
      console.error('Failed to load results from storage:', err)
    }

    return { items: null, time: null }
  }, [])

  const getUnlockItems = useCallback(
    async (
      existingItems: UnlockItem[] | null = null,
      existingTime: string | null = null,
    ) => {
      try {
        const defaultItems = await invoke<UnlockItem[]>('get_unlock_items')
        const mergedItems = mergeUnlockItems(defaultItems, existingItems)
        const sortedItems = sortItemsByName(mergedItems)

        setUnlockItems(sortedItems)
        saveResultsToStorage(
          sortedItems,
          existingItems && existingItems.length > 0 ? existingTime : null,
        )
      } catch (err: any) {
        console.error('Failed to get unlock items:', err)
      }
    },
    [mergeUnlockItems, saveResultsToStorage, sortItemsByName],
  )

  useEffect(() => {
    void (async () => {
      const { items: storedItems, time: storedTime } = loadResultsFromStorage()

      if (storedItems && storedItems.length > 0) {
        setUnlockItems(sortItemsByName(storedItems))
        await getUnlockItems(storedItems, storedTime)
      } else {
        await getUnlockItems()
      }
    })()
  }, [getUnlockItems, loadResultsFromStorage, sortItemsByName])

  const invokeWithTimeout = async <T,>(
    cmd: string,
    args?: any,
    timeout = 15000,
  ): Promise<T> => {
    return Promise.race([
      invoke<T>(cmd, args),
      new Promise<T>((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(t('tests.unlock.page.messages.detectionTimeout'))),
          timeout,
        ),
      ),
    ])
  }

  // 执行全部项目检测
  const checkAllMedia = useLockFn(async () => {
    try {
      setIsCheckingAll(true)
      const result = await invokeWithTimeout<UnlockItem[]>('check_media_unlock')
      const sortedItems = sortItemsByName(dedupeUnlockItems(result))

      setUnlockItems(sortedItems)
      const currentTime = new Date().toLocaleString()

      saveResultsToStorage(sortedItems, currentTime)

      setIsCheckingAll(false)
    } catch (err: any) {
      setIsCheckingAll(false)
      showNotice.error('tests.unlock.page.messages.detectionTimeout', err)
      console.error('Failed to check media unlock:', err)
    }
  })

  // 检测单个流媒体服务
  const checkSingleMedia = useLockFn(async (name: string) => {
    try {
      setLoadingItems((prev) => [...prev, name])
      const result = await invokeWithTimeout<UnlockItem[]>('check_media_unlock')
      const dedupedResult = dedupeUnlockItems(result)

      const normalizedTargetName = normalizeUnlockName(name)
      const targetItem = dedupedResult.find(
        (item: UnlockItem) =>
          normalizeUnlockName(item.name) === normalizedTargetName,
      )

      if (targetItem) {
        const updatedItems = sortItemsByName(
          dedupeUnlockItems(
            unlockItems.map((item: UnlockItem) =>
              normalizeUnlockName(item.name) === normalizedTargetName
                ? targetItem
                : item,
            ),
          ),
        )

        setUnlockItems(updatedItems)
        const currentTime = new Date().toLocaleString()

        saveResultsToStorage(updatedItems, currentTime)
      }

      setLoadingItems((prev) => prev.filter((item) => item !== name))
    } catch (err: any) {
      setLoadingItems((prev) => prev.filter((item) => item !== name))
      showNotice.error(
        'tests.unlock.page.messages.detectionFailedWithName',
        { name },
        err,
      )
      console.error(`Failed to check ${name}:`, err)
    }
  })

  return (
    <BasePage
      title={t('tests.unlock.page.title')}
      header={
        <div className="flex items-center gap-component">
          <Button size="sm" disabled={isCheckingAll} onClick={checkAllMedia}>
            {isCheckingAll ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            {isCheckingAll
              ? t('tests.unlock.page.actions.testing')
              : t('tests.page.actions.testAll')}
          </Button>
        </div>
      }
    >
      {unlockItems.length === 0 ? (
        <div className="flex h-1/2 items-center justify-center">
          <BaseEmpty textKey="tests.unlock.page.empty" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-stack sm:grid-cols-2 md:grid-cols-3">
          {unlockItems.map((item) => (
            <div
              key={item.name}
              className="relative flex h-full flex-col overflow-hidden rounded-[var(--radius-container)] border border-l-4 border-[var(--color-border)] bg-[var(--color-bg-card)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-accent)_5%,transparent)]"
              style={{ borderLeftColor: getStatusBorderColor(item.status) }}
            >
              <div className="flex-1 p-stack">
                <div className="flex items-center justify-between">
                  <span className="text-body-lg font-semibold text-[var(--color-text-primary)]">
                    {item.name}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          disabled={
                            loadingItems.includes(item.name) || isCheckingAll
                          }
                          onClick={() => checkSingleMedia(item.name)}
                          className="rounded-full border-[color-mix(in_srgb,var(--color-accent)_50%,transparent)] text-[var(--color-accent)]"
                        >
                          <RefreshCw
                            className={cn(
                              loadingItems.includes(item.name) &&
                                'animate-spin',
                            )}
                          />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {t('tests.components.item.actions.test')}
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="flex flex-wrap items-center gap-component">
                  <Badge
                    className={cn(
                      STATUS_BADGE_CLASS[getStatusColor(item.status)],
                      item.status === 'Pending' ? 'font-normal' : 'font-bold',
                    )}
                  >
                    {getStatusIcon(item.status)}
                    {t(STATUS_LABEL_KEYS[item.status] ?? item.status)}
                  </Badge>

                  {item.region && (
                    <Badge
                      variant="outline"
                      className="border-[color-mix(in_srgb,var(--color-info)_50%,transparent)] text-[var(--color-info)]"
                    >
                      {item.region}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mx-component border-t border-dashed border-[color-mix(in_srgb,var(--color-border)_20%,transparent)]" />

              <div className="px-stack py-adjust">
                <span className="block text-right text-caption text-[var(--color-text-secondary)]">
                  {item.check_time || '-- --'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </BasePage>
  )
}

export default UnlockPage
