/* eslint-disable @eslint-react/set-state-in-effect */
import { useLockFn } from 'ahooks'
import {
  ArrowDownAZ,
  ArrowUpDown,
  ChevronRight,
  Clock,
  Gauge,
  Wifi,
  WifiHigh,
  WifiLow,
  WifiOff,
  WifiZero,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { delayGroup } from 'tauri-plugin-mihomo-api'

import { EnhancedCard } from '@/components/home/enhanced-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useProfiles } from '@/hooks/use-profiles'
import { useProxySelection } from '@/hooks/use-proxy-selection'
import { useVerge } from '@/hooks/use-verge'
import { cn } from '@/lib/utils'
import {
  useAppRefreshers,
  useClashConfigData,
  useCoreDataStatus,
  useProxiesData,
  useRulesData,
} from '@/providers/app-data-context'
import delayManager from '@/services/delay'
import { debugLog } from '@/utils/debug'

// lucide 信号图标别名（对应原 MUI SignalWifi* 分档）
const SignalStrong = Wifi
const SignalGood = WifiHigh
const SignalMedium = WifiLow
const SignalWeak = WifiLow
const SignalError = WifiOff
const SignalNone = WifiZero

// 本地存储的键名
const STORAGE_KEY_GROUP = 'clash-verge-selected-proxy-group'
const STORAGE_KEY_PROXY = 'clash-verge-selected-proxy'
const STORAGE_KEY_SORT_TYPE = 'clash-verge-proxy-sort-type'

const AUTO_CHECK_DEFAULT_INTERVAL_MINUTES = 5
const AUTO_CHECK_INITIAL_DELAY_MS = 100

// 延迟徽章统一尺寸
const CHIP_BASE =
  'h-5 rounded-full px-inline py-0 text-[11px] font-medium leading-none'

// 延迟色 → 徽章底色/文字色（对应原 MUI 填充色 Chip）
const DELAY_CHIP_CLASS: Record<ReturnType<typeof convertDelayColor>, string> = {
  success:
    'border-transparent bg-[var(--color-success)] text-[var(--color-text-on-accent)]',
  warning:
    'border-transparent bg-[var(--color-warning)] text-[var(--color-text-on-accent)]',
  error:
    'border-transparent bg-[var(--color-danger)] text-[var(--color-text-on-accent)]',
  primary:
    'border-transparent bg-[var(--color-accent)] text-[var(--color-text-on-accent)]',
  default:
    'border-transparent bg-[var(--color-bg-active)] text-[var(--color-text-secondary)]',
}

// 代理节点信息接口
interface ProxyOption {
  name: string
}

// 排序类型: 默认 | 按延迟 | 按字母
type ProxySortType = 0 | 1 | 2

function convertDelayColor(
  delayValue: number,
): 'success' | 'warning' | 'error' | 'primary' | 'default' {
  const colorStr = delayManager.formatDelayColor(delayValue)
  if (!colorStr) return 'default'

  const mainColor = colorStr.split('.')[0]

  switch (mainColor) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'error':
      return 'error'
    case 'primary':
      return 'primary'
    default:
      return 'default'
  }
}

function getSignalIcon(delay: number): {
  icon: React.ReactElement
  text: string
  color: string
} {
  if (delay === -2)
    return {
      icon: <SignalNone className="size-6" />,
      text: '测试中',
      color: 'text-[var(--color-text-secondary)]',
    }
  if (delay === -1)
    return {
      icon: <SignalNone className="size-6" />,
      text: '未测试',
      color: 'text-[var(--color-text-secondary)]',
    }
  if (delay > 1e5)
    return {
      icon: <SignalError className="size-6" />,
      text: '错误',
      color: 'text-[var(--color-danger)]',
    }
  if (delay === 0 || delay >= 10000)
    return {
      icon: <SignalError className="size-6" />,
      text: '超时',
      color: 'text-[var(--color-danger)]',
    }
  if (delay >= 500)
    return {
      icon: <SignalWeak className="size-6" />,
      text: '延迟较高',
      color: 'text-[var(--color-danger)]',
    }
  if (delay >= 300)
    return {
      icon: <SignalMedium className="size-6" />,
      text: '延迟中等',
      color: 'text-[var(--color-warning)]',
    }
  if (delay >= 200)
    return {
      icon: <SignalGood className="size-6" />,
      text: '延迟良好',
      color: 'text-[var(--color-info)]',
    }
  return {
    icon: <SignalStrong className="size-6" />,
    text: '延迟极佳',
    color: 'text-[var(--color-success)]',
  }
}

export const CurrentProxyCard = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { proxies } = useProxiesData()
  const { clashConfig } = useClashConfigData()
  const { rules } = useRulesData()
  const { refreshProxy } = useAppRefreshers()
  const { isCoreDataPending } = useCoreDataStatus()
  const { verge } = useVerge()
  const { current: currentProfile } = useProfiles()
  const autoDelayEnabled = verge?.enable_auto_delay_detection ?? false
  const defaultLatencyTimeout = verge?.default_latency_timeout
  const autoDelayIntervalMs = useMemo(() => {
    const rawInterval = verge?.auto_delay_detection_interval_minutes
    const intervalMinutes =
      typeof rawInterval === 'number' && rawInterval > 0
        ? rawInterval
        : AUTO_CHECK_DEFAULT_INTERVAL_MINUTES
    return Math.max(1, Math.round(intervalMinutes)) * 60 * 1000
  }, [verge?.auto_delay_detection_interval_minutes])
  const currentProfileId = currentProfile?.uid || null

  const getProfileStorageKey = useCallback(
    (baseKey: string) =>
      currentProfileId ? `${baseKey}:${currentProfileId}` : baseKey,
    [currentProfileId],
  )

  const readProfileScopedItem = useCallback(
    (baseKey: string) => {
      if (typeof window === 'undefined') return null
      const profileKey = getProfileStorageKey(baseKey)
      const profileValue = localStorage.getItem(profileKey)
      if (profileValue != null) {
        return profileValue
      }

      if (profileKey !== baseKey) {
        const legacyValue = localStorage.getItem(baseKey)
        if (legacyValue != null) {
          localStorage.removeItem(baseKey)
          localStorage.setItem(profileKey, legacyValue)
          return legacyValue
        }
      }

      return null
    },
    [getProfileStorageKey],
  )

  const writeProfileScopedItem = useCallback(
    (baseKey: string, value: string) => {
      if (typeof window === 'undefined') return
      const profileKey = getProfileStorageKey(baseKey)
      localStorage.setItem(profileKey, value)
      if (profileKey !== baseKey) {
        localStorage.removeItem(baseKey)
      }
    },
    [getProfileStorageKey],
  )

  // 统一代理选择器
  const { handleSelectChange } = useProxySelection({
    onSuccess: () => {
      refreshProxy()
    },
    onError: (error) => {
      console.error('代理切换失败', error)
      refreshProxy()
    },
  })

  // 判断模式
  const mode = clashConfig?.mode?.toLowerCase() || 'rule'
  const isGlobalMode = mode === 'global'
  const isDirectMode = mode === 'direct'

  // Sorting type state
  const [sortType, setSortType] = useState<ProxySortType>(() => {
    const savedSortType = localStorage.getItem(STORAGE_KEY_SORT_TYPE)
    return savedSortType ? (Number(savedSortType) as ProxySortType) : 0
  })
  const [delaySortRefresh, setDelaySortRefresh] = useState(0)

  const normalizePolicyName = useCallback(
    (value?: string | null) => (typeof value === 'string' ? value.trim() : ''),
    [],
  )

  const matchPolicyName = useMemo(() => {
    if (!Array.isArray(rules)) return ''
    for (let index = rules.length - 1; index >= 0; index -= 1) {
      const rule = rules[index]
      if (!rule) continue

      if (
        typeof rule?.type === 'string' &&
        rule.type.toUpperCase() === 'MATCH'
      ) {
        const policy = normalizePolicyName(rule.proxy)
        if (policy) {
          return policy
        }
      }
    }
    return ''
  }, [rules, normalizePolicyName])

  type ProxyGroupOption = {
    name: string
    now: string
    all: string[]
    type?: string
  }

  type ProxyState = {
    proxyData: {
      groups: ProxyGroupOption[]
      records: Record<string, any>
    }
    selection: {
      group: string
      proxy: string
    }
    displayProxy: any
  }

  const [state, setState] = useState<ProxyState>({
    proxyData: {
      groups: [],
      records: {},
    },
    selection: {
      group: '',
      proxy: '',
    },
    displayProxy: null,
  })

  const autoCheckInProgressRef = useRef(false)
  const latestTimeoutRef = useRef<number>(
    verge?.default_latency_timeout || 10000,
  )
  const latestProxyRecordRef = useRef<any | null>(null)

  useEffect(() => {
    latestTimeoutRef.current = verge?.default_latency_timeout || 10000
  }, [verge?.default_latency_timeout])

  useEffect(() => {
    if (!state.selection.proxy) {
      latestProxyRecordRef.current = null
      return
    }
    latestProxyRecordRef.current =
      state.proxyData.records?.[state.selection.proxy] || null
  }, [state.selection.proxy, state.proxyData.records])

  // 初始化选择的组
  useEffect(() => {
    if (!proxies) return

    const getPrimaryGroupName = () => {
      if (!proxies?.groups?.length) return ''

      const primaryKeywords = [
        'auto',
        'select',
        'proxy',
        '节点选择',
        '自动选择',
      ]
      const primaryGroup =
        proxies.groups.find((group: { name: string }) =>
          primaryKeywords.some((keyword) =>
            group.name.toLowerCase().includes(keyword.toLowerCase()),
          ),
        ) ||
        proxies.groups.filter((g: { name: string }) => g.name !== 'GLOBAL')[0]

      return primaryGroup?.name || ''
    }

    const primaryGroupName = getPrimaryGroupName()

    // 根据模式确定初始组
    if (isGlobalMode) {
      setState((prev) => ({
        ...prev,
        selection: {
          ...prev.selection,
          group: 'GLOBAL',
        },
      }))
    } else if (isDirectMode) {
      setState((prev) => ({
        ...prev,
        selection: {
          ...prev.selection,
          group: 'DIRECT',
        },
      }))
    } else {
      const savedGroup = readProfileScopedItem(STORAGE_KEY_GROUP)
      setState((prev) => ({
        ...prev,
        selection: {
          ...prev.selection,
          group: savedGroup || primaryGroupName || '',
        },
      }))
    }
  }, [isGlobalMode, isDirectMode, proxies, readProfileScopedItem])

  // 监听代理数据变化，更新状态
  useEffect(() => {
    if (!proxies) return

    setState((prev) => {
      const groupsMap = new Map<string, ProxyGroupOption>()

      const registerGroup = (group: any, fallbackName?: string) => {
        if (!group && !fallbackName) return

        const rawName =
          typeof group?.name === 'string' && group.name.length > 0
            ? group.name
            : fallbackName
        const name = normalizePolicyName(rawName)
        if (!name || groupsMap.has(name)) return

        const rawAll = (
          Array.isArray(group?.all)
            ? (group.all as Array<string | { name?: string }>)
            : []
        ) as Array<string | { name?: string }>
        const allNames = rawAll
          .map((item) =>
            typeof item === 'string'
              ? normalizePolicyName(item)
              : normalizePolicyName(item?.name),
          )
          .filter((value): value is string => value.length > 0)

        const uniqueAll = Array.from(new Set(allNames))
        if (uniqueAll.length === 0) return

        groupsMap.set(name, {
          name,
          now: normalizePolicyName(group?.now),
          all: uniqueAll,
          type: group?.type,
        })
      }

      if (matchPolicyName) {
        const matchGroup =
          proxies.groups?.find(
            (g: { name: string }) => g.name === matchPolicyName,
          ) ||
          (proxies.global?.name === matchPolicyName ? proxies.global : null) ||
          proxies.records?.[matchPolicyName]
        registerGroup(matchGroup, matchPolicyName)
      }

      ;(proxies.groups || [])
        .filter(
          (g: { type?: string; hidden?: boolean }) =>
            !g?.hidden && (g?.type === 'Selector' || g?.type === 'URLTest'),
        )
        .forEach((selectableGroup: any) => {
          registerGroup(selectableGroup)
        })

      const filteredGroups = Array.from(groupsMap.values())

      let newProxy = ''
      let newDisplayProxy = null
      let newGroup = prev.selection.group

      if (isDirectMode) {
        newGroup = 'DIRECT'
        newProxy = 'DIRECT'
        newDisplayProxy = proxies.records?.DIRECT || { name: 'DIRECT' }
      } else if (isGlobalMode && proxies.global) {
        newGroup = 'GLOBAL'
        newProxy = proxies.global.now || ''
        newDisplayProxy = proxies.records?.[newProxy] || null
      } else {
        const currentGroup = filteredGroups.find(
          (g: { name: string }) => g.name === prev.selection.group,
        )

        if (!currentGroup && filteredGroups.length > 0) {
          const firstGroup = filteredGroups[0]
          if (firstGroup) {
            newGroup = firstGroup.name
            newProxy = firstGroup.now || firstGroup.all[0] || ''
            newDisplayProxy = proxies.records?.[newProxy] || null

            if (!isGlobalMode && !isDirectMode) {
              writeProfileScopedItem(STORAGE_KEY_GROUP, newGroup)
              if (newProxy) {
                writeProfileScopedItem(STORAGE_KEY_PROXY, newProxy)
              }
            }
          }
        } else if (currentGroup) {
          newProxy = currentGroup.now || currentGroup.all[0] || ''
          newDisplayProxy = proxies.records?.[newProxy] || null
        }
      }

      return {
        proxyData: {
          groups: filteredGroups,
          records: proxies.records || {},
        },
        selection: {
          group: newGroup,
          proxy: newProxy,
        },
        displayProxy: newDisplayProxy,
      }
    })
  }, [
    proxies,
    isGlobalMode,
    isDirectMode,
    writeProfileScopedItem,
    normalizePolicyName,
    matchPolicyName,
  ])

  // 处理代理组变更
  const handleGroupChange = useCallback(
    (newGroup: string) => {
      if (isGlobalMode || isDirectMode) return

      writeProfileScopedItem(STORAGE_KEY_GROUP, newGroup)

      setState((prev) => {
        const group = prev.proxyData.groups.find(
          (g: { name: string }) => g.name === newGroup,
        )
        if (group) {
          return {
            ...prev,
            selection: {
              group: newGroup,
              proxy: group.now,
            },
            displayProxy: prev.proxyData.records[group.now] || null,
          }
        }
        return {
          ...prev,
          selection: {
            ...prev.selection,
            group: newGroup,
          },
        }
      })
    },
    [isGlobalMode, isDirectMode, writeProfileScopedItem],
  )

  // 处理代理节点变更
  const handleProxyChange = useCallback(
    (newProxy: string) => {
      if (isDirectMode) return

      const currentGroup = state.selection.group
      const previousProxy = state.selection.proxy

      setState((prev: ProxyState) => ({
        ...prev,
        selection: {
          ...prev.selection,
          proxy: newProxy,
        },
        displayProxy: prev.proxyData.records[newProxy] || null,
      }))

      if (!isGlobalMode && !isDirectMode) {
        writeProfileScopedItem(STORAGE_KEY_PROXY, newProxy)
      }

      const skipConfigSave = isGlobalMode || isDirectMode
      handleSelectChange(
        currentGroup,
        previousProxy,
        skipConfigSave,
      )({
        target: { value: newProxy },
      })
    },
    [
      isDirectMode,
      isGlobalMode,
      state.selection,
      handleSelectChange,
      writeProfileScopedItem,
    ],
  )

  // 导航到代理页面
  const goToProxies = useCallback(() => {
    navigate('/proxies')
  }, [navigate])

  // 获取要显示的代理节点
  const currentProxy = useMemo(() => {
    return state.displayProxy
  }, [state.displayProxy])

  // 获取当前节点的延迟（增加非空校验）
  const currentDelay =
    currentProxy && state.selection.group
      ? delayManager.getDelayFix(currentProxy, state.selection.group)
      : -1

  // 信号图标（增加非空校验）
  const signalInfo =
    currentProxy && state.selection.group
      ? getSignalIcon(currentDelay)
      : {
          icon: <SignalNone className="size-6" />,
          text: '未初始化',
          color: 'text-[var(--color-text-secondary)]',
        }

  const checkCurrentProxyDelay = useCallback(async () => {
    if (autoCheckInProgressRef.current) return
    if (isDirectMode) return

    const groupName = state.selection.group
    const proxyName = state.selection.proxy

    if (!groupName || !proxyName) return

    const proxyRecord = latestProxyRecordRef.current
    if (!proxyRecord) {
      debugLog(
        `[CurrentProxyCard] 自动延迟检测跳过，组: ${groupName}, 节点: ${proxyName} 未找到`,
      )
      return
    }

    autoCheckInProgressRef.current = true

    const timeout = latestTimeoutRef.current || 10000

    try {
      debugLog(
        `[CurrentProxyCard] 自动检测当前节点延迟，组: ${groupName}, 节点: ${proxyName}`,
      )
      await delayManager.checkDelay(
        proxyRecord.name,
        groupName,
        timeout,
        proxyRecord.provider,
      )
    } catch (error) {
      console.error(
        `[CurrentProxyCard] 自动检测当前节点延迟失败，组: ${groupName}, 节点: ${proxyName}`,
        error,
      )
    } finally {
      autoCheckInProgressRef.current = false
      refreshProxy()
      if (sortType === 1) {
        setDelaySortRefresh((prev) => prev + 1)
      }
    }
  }, [
    isDirectMode,
    refreshProxy,
    state.selection.group,
    state.selection.proxy,
    sortType,
  ])

  useEffect(() => {
    if (isDirectMode) return
    if (!autoDelayEnabled) return
    if (!state.selection.group || !state.selection.proxy) return

    let disposed = false
    let intervalTimer: ReturnType<typeof setTimeout> | null = null
    let initialTimer: ReturnType<typeof setTimeout> | null = null

    const runAndSchedule = async () => {
      if (disposed) return
      await checkCurrentProxyDelay()
      if (disposed) return
      intervalTimer = setTimeout(runAndSchedule, autoDelayIntervalMs)
    }

    initialTimer = setTimeout(async () => {
      await checkCurrentProxyDelay()
      if (disposed) return
      intervalTimer = setTimeout(runAndSchedule, autoDelayIntervalMs)
    }, AUTO_CHECK_INITIAL_DELAY_MS)

    return () => {
      disposed = true
      if (initialTimer) clearTimeout(initialTimer)
      if (intervalTimer) clearTimeout(intervalTimer)
    }
  }, [
    checkCurrentProxyDelay,
    autoDelayIntervalMs,
    isDirectMode,
    state.selection.group,
    state.selection.proxy,
    autoDelayEnabled,
  ])

  // 自定义渲染选择框中的值
  const renderProxyValue = (selected: string) => {
    if (!selected || !state.proxyData.records[selected]) return selected

    const delayValue = delayManager.getDelayFix(
      state.proxyData.records[selected],
      state.selection.group,
    )

    return (
      <span className="flex min-w-0 flex-1 items-center justify-between gap-component">
        <span className="truncate">{selected}</span>
        <Badge
          className={cn(
            CHIP_BASE,
            'shrink-0',
            DELAY_CHIP_CLASS[convertDelayColor(delayValue)],
          )}
        >
          {delayManager.formatDelay(delayValue)}
        </Badge>
      </span>
    )
  }

  // 排序类型变更
  const handleSortTypeChange = useCallback(() => {
    const newSortType = ((sortType + 1) % 3) as ProxySortType
    setSortType(newSortType)
    localStorage.setItem(STORAGE_KEY_SORT_TYPE, newSortType.toString())
  }, [sortType])

  // 延迟测试
  const handleCheckDelay = useLockFn(async () => {
    const groupName = state.selection.group
    if (!groupName || isDirectMode) return

    debugLog(`[CurrentProxyCard] 开始测试所有延迟，组: ${groupName}`)

    const timeout = verge?.default_latency_timeout || 10000

    // 获取当前组的所有代理
    const delayProxies: IProxyItem[] = []

    if (isGlobalMode && proxies?.global) {
      // 全局模式
      const allProxies = proxies.global.all
        .filter((p: any) => {
          const name = typeof p === 'string' ? p : p.name
          return name !== 'DIRECT' && name !== 'REJECT'
        })
        .map((p: any) => (typeof p === 'string' ? p : p.name))

      allProxies.forEach((name: string) => {
        const proxy = state.proxyData.records[name]
        delayProxies.push(proxy)
      })
    } else {
      // 规则模式
      const group = state.proxyData.groups.find((g) => g.name === groupName)
      if (group) {
        group.all.forEach((name: string) => {
          const proxy = state.proxyData.records[name]
          delayProxies.push(proxy)
        })
      }
    }

    // 测试全部节点
    if (delayProxies.length > 0) {
      const url = delayManager.getUrl(groupName)
      debugLog(`[CurrentProxyCard] 测试URL: ${url}, 超时: ${timeout}ms`)

      try {
        await Promise.race([
          delayManager.checkListDelay(delayProxies, groupName, timeout),
          delayGroup(groupName, url, timeout),
        ])
        debugLog(`[CurrentProxyCard] 延迟测试完成，组: ${groupName}`)
      } catch (error) {
        console.error(
          `[CurrentProxyCard] 延迟测试出错，组: ${groupName}`,
          error,
        )
      }
    }

    refreshProxy()
    if (sortType === 1) {
      setDelaySortRefresh((prev) => prev + 1)
    }
  })

  // 计算要显示的代理选项（增加非空校验）
  const proxyOptions = useMemo(() => {
    const sortWithLatency = (proxiesToSort: ProxyOption[]) => {
      if (!proxiesToSort || sortType === 0) return proxiesToSort

      if (!state.proxyData.records || !state.selection.group) {
        return proxiesToSort
      }

      const list = [...proxiesToSort]

      if (sortType === 1) {
        const refreshTick = delaySortRefresh
        const effectiveTimeout =
          typeof defaultLatencyTimeout === 'number' && defaultLatencyTimeout > 0
            ? defaultLatencyTimeout
            : 10000

        const categorizeDelay = (delay: number): [number, number] => {
          if (!Number.isFinite(delay)) return [5, Number.MAX_SAFE_INTEGER]
          if (delay > 1e5) return [4, delay]
          if (delay === 0 || (delay >= effectiveTimeout && delay <= 1e5)) {
            return [3, delay || effectiveTimeout]
          }
          if (delay < 0) return [5, Number.MAX_SAFE_INTEGER]
          return [0, delay]
        }

        list.sort((a, b) => {
          const recordA = state.proxyData.records[a.name]
          const recordB = state.proxyData.records[b.name]

          const [ar, av] = recordA
            ? categorizeDelay(
                delayManager.getDelayFix(recordA, state.selection.group),
              )
            : [6, Number.MAX_SAFE_INTEGER]
          const [br, bv] = recordB
            ? categorizeDelay(
                delayManager.getDelayFix(recordB, state.selection.group),
              )
            : [6, Number.MAX_SAFE_INTEGER]

          if (ar !== br) return ar - br
          if (av !== bv) return av - bv
          return refreshTick >= 0 ? a.name.localeCompare(b.name) : 0
        })
      } else {
        list.sort((a, b) => a.name.localeCompare(b.name))
      }

      return list
    }

    if (isDirectMode) {
      return [{ name: 'DIRECT' }]
    }
    if (isGlobalMode && proxies?.global) {
      const options = proxies.global.all
        .filter((p: any) => {
          const name = typeof p === 'string' ? p : p.name
          return name !== 'DIRECT' && name !== 'REJECT'
        })
        .map((p: any) => ({
          name: typeof p === 'string' ? p : p.name,
        }))

      return sortWithLatency(options)
    }

    // 规则模式
    const group = state.selection.group
      ? state.proxyData.groups.find((g) => g.name === state.selection.group)
      : null

    if (group) {
      const options = group.all.map((name) => ({ name }))
      return sortWithLatency(options)
    }

    return []
  }, [
    isDirectMode,
    isGlobalMode,
    proxies,
    state.proxyData,
    state.selection.group,
    sortType,
    delaySortRefresh,
    defaultLatencyTimeout,
  ])

  // 获取排序图标
  const getSortIcon = (): React.ReactElement => {
    switch (sortType) {
      case 1:
        return <Clock className="size-5" />
      case 2:
        return <ArrowDownAZ className="size-5" />
      default:
        return <ArrowUpDown className="size-5" />
    }
  }

  // 获取排序提示文本
  const getSortTooltip = (): string => {
    switch (sortType) {
      case 0:
        return t('proxies.page.tooltips.sortDefault')
      case 1:
        return t('proxies.page.tooltips.sortDelay')
      case 2:
        return t('proxies.page.tooltips.sortName')
      default:
        return ''
    }
  }

  return (
    <EnhancedCard
      title={t('home.components.currentProxy.title')}
      icon={
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'flex items-center justify-center',
                signalInfo.color,
              )}
            >
              {currentProxy ? (
                signalInfo.icon
              ) : (
                <SignalNone className="size-6 text-[var(--color-text-disabled)]" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            {currentProxy
              ? `${signalInfo.text}: ${delayManager.formatDelay(currentDelay)}`
              : '无代理节点'}
          </TooltipContent>
        </Tooltip>
      }
      iconColor={currentProxy ? 'primary' : undefined}
      action={
        <div className="flex items-center gap-component">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleCheckDelay}
                  disabled={isDirectMode}
                >
                  <Gauge className="size-5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t('home.components.currentProxy.actions.refreshDelay')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleSortTypeChange}
              >
                {getSortIcon()}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{getSortTooltip()}</TooltipContent>
          </Tooltip>
          <Button
            variant="outline"
            size="sm"
            onClick={goToProxies}
            className="rounded-[var(--radius-control)]"
          >
            {t('layout.components.navigation.tabs.proxies')}
            <ChevronRight className="size-4" />
          </Button>
        </div>
      }
    >
      {isCoreDataPending ? (
        <div className="h-6 py-section-sm" />
      ) : currentProxy ? (
        <div>
          {/* 代理节点信息显示 */}
          <div className="mb-inset flex items-center justify-between rounded-[var(--radius-compact)] border border-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_5%,transparent)] p-component">
            <div>
              <div className="text-body-lg font-medium text-[var(--color-text-primary)]">
                {currentProxy.name}
              </div>

              <div className="flex flex-wrap items-center gap-inline">
                <span className="text-caption text-[var(--color-text-secondary)]">
                  {currentProxy.type}
                </span>
                {isGlobalMode && (
                  <Badge className={cn(CHIP_BASE, DELAY_CHIP_CLASS.primary)}>
                    {t('home.components.currentProxy.labels.globalMode')}
                  </Badge>
                )}
                {isDirectMode && (
                  <Badge className={cn(CHIP_BASE, DELAY_CHIP_CLASS.success)}>
                    {t('home.components.currentProxy.labels.directMode')}
                  </Badge>
                )}
                {/* 节点特性 */}
                {currentProxy.udp && (
                  <Badge variant="outline" className={CHIP_BASE}>
                    UDP
                  </Badge>
                )}
                {currentProxy.tfo && (
                  <Badge variant="outline" className={CHIP_BASE}>
                    TFO
                  </Badge>
                )}
                {currentProxy.xudp && (
                  <Badge variant="outline" className={CHIP_BASE}>
                    XUDP
                  </Badge>
                )}
                {currentProxy.mptcp && (
                  <Badge variant="outline" className={CHIP_BASE}>
                    MPTCP
                  </Badge>
                )}
                {currentProxy.smux && (
                  <Badge variant="outline" className={CHIP_BASE}>
                    SMUX
                  </Badge>
                )}
              </div>
            </div>

            {/* 显示延迟 */}
            {currentProxy && !isDirectMode && (
              <Badge
                className={cn(
                  CHIP_BASE,
                  'shrink-0',
                  DELAY_CHIP_CLASS[convertDelayColor(currentDelay)],
                )}
              >
                {delayManager.formatDelay(currentDelay)}
              </Badge>
            )}
          </div>
          {/* 代理组选择器 */}
          <div className="mb-stack">
            <label className="mb-inline block text-caption text-[var(--color-text-secondary)]">
              {t('home.components.currentProxy.labels.group')}
            </label>
            <Select
              value={state.selection.group}
              onValueChange={handleGroupChange}
              disabled={isGlobalMode || isDirectMode}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={t('home.components.currentProxy.labels.group')}
                />
              </SelectTrigger>
              <SelectContent>
                {state.proxyData.groups.map((group) => (
                  <SelectItem key={group.name} value={group.name}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 代理节点选择器 */}
          <div>
            <label className="mb-inline block text-caption text-[var(--color-text-secondary)]">
              {t('home.components.currentProxy.labels.proxy')}
            </label>
            <Select
              value={state.selection.proxy}
              onValueChange={handleProxyChange}
              disabled={isDirectMode}
            >
              <SelectTrigger className="w-full">
                {state.selection.proxy ? (
                  renderProxyValue(state.selection.proxy)
                ) : (
                  <SelectValue
                    placeholder={t('home.components.currentProxy.labels.proxy')}
                  />
                )}
              </SelectTrigger>
              <SelectContent className="max-h-[500px]">
                {isDirectMode
                  ? null
                  : proxyOptions.map((proxy) => {
                      const delayValue =
                        state.proxyData.records[proxy.name] &&
                        state.selection.group
                          ? delayManager.getDelayFix(
                              state.proxyData.records[proxy.name],
                              state.selection.group,
                            )
                          : -1
                      return (
                        <SelectItem
                          key={proxy.name}
                          value={proxy.name}
                          className="pr-8 [&>span:last-child]:w-full"
                        >
                          <span className="flex w-full items-center justify-between gap-component">
                            <span className="truncate">{proxy.name}</span>
                            <Badge
                              className={cn(
                                'h-[22px] min-w-[60px] shrink-0 justify-center rounded-full px-inline py-0 text-[11px] font-medium leading-none',
                                DELAY_CHIP_CLASS[convertDelayColor(delayValue)],
                              )}
                            >
                              {delayManager.formatDelay(delayValue)}
                            </Badge>
                          </span>
                        </SelectItem>
                      )
                    })}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div className="py-section-sm text-center">
          <span className="block h-6 text-body-lg text-[var(--color-text-secondary)]">
            {t('home.components.currentProxy.labels.noActiveNode')}
          </span>
        </div>
      )}
    </EnhancedCard>
  )
}
