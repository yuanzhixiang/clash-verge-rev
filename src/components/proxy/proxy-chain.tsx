import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import yaml from 'js-yaml'
import {
  ArrowDown,
  GripVertical,
  Info,
  Link,
  Trash2,
  TriangleAlert,
  Unlink,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  closeAllConnections,
  selectNodeForGroup,
} from 'tauri-plugin-mihomo-api'

import { TooltipIcon } from '@/components/base'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAppRefreshers, useProxiesData } from '@/providers/app-data-context'
import { updateProxyChainConfigInRuntime } from '@/services/cmds'
import { debugLog } from '@/utils/debug'

interface ProxyChainItem {
  id: string
  name: string
  type?: string
  delay?: number
}

interface ParsedChainConfig {
  proxies?: Array<{
    name: string
    type: string
    [key: string]: any
  }>
}

interface ProxyChainProps {
  proxyChain: ProxyChainItem[]
  onUpdateChain: (chain: ProxyChainItem[]) => void
  chainConfigData?: string | null
  onMarkUnsavedChanges?: () => void
  mode?: string
  selectedGroup?: string | null
}

interface SortableItemProps {
  proxy: ProxyChainItem
  index: number
  isFirst: boolean
  isLast: boolean
  onRemove: (id: string) => void
}

const toChainItems = (
  parsedConfig: ParsedChainConfig | null | undefined,
): ProxyChainItem[] => {
  const timestamp = Date.now()

  return (
    parsedConfig?.proxies?.map((proxy, index) => ({
      id: `${proxy.name}_${timestamp}_${index}`,
      name: proxy.name,
      type: proxy.type,
      delay: undefined,
    })) || []
  )
}

const SortableItem = ({
  proxy,
  index,
  isFirst,
  isLast,
  onRemove,
}: SortableItemProps) => {
  const { t } = useTranslation()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: proxy.id })

  const roleLabel = isFirst
    ? t('proxies.page.chain.entryNode')
    : isLast
      ? t('proxies.page.chain.exitNode')
      : undefined

  const roleColorVar = isFirst
    ? 'var(--color-success)'
    : isLast
      ? 'var(--color-warning)'
      : undefined

  const delayBg =
    proxy.delay !== undefined
      ? proxy.delay > 0 && proxy.delay < 200
        ? 'var(--color-success)'
        : proxy.delay > 0 && proxy.delay < 800
          ? 'var(--color-warning)'
          : 'var(--color-danger)'
      : undefined

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        backgroundColor: isDragging
          ? 'var(--color-bg-active)'
          : 'var(--color-bg-card)',
        border: roleColorVar
          ? `1.5px solid ${roleColorVar}`
          : '1px solid var(--color-border)',
      }}
      className={cn(
        'mb-0 flex items-center rounded-[var(--radius-compact)] p-component transition-[box-shadow,background-color] duration-200',
        isDragging
          ? 'shadow-[var(--shadow-card-hover)]'
          : 'shadow-[var(--shadow-card)]',
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="mr-component flex cursor-grab items-center text-[var(--color-text-secondary)] active:cursor-grabbing"
      >
        <GripVertical className="size-5" />
      </div>

      {roleLabel ? (
        <Badge
          className="mr-component font-bold text-[var(--color-text-on-accent)]"
          style={{ backgroundColor: roleColorVar }}
        >
          {roleLabel}
        </Badge>
      ) : (
        <Badge className="mr-component min-w-8 justify-center">
          {index + 1}
        </Badge>
      )}

      <p className="flex-1 truncate text-[14px] font-medium">{proxy.name}</p>

      {proxy.type && (
        <Badge variant="outline" className="mr-component">
          {proxy.type}
        </Badge>
      )}

      {proxy.delay !== undefined && (
        <Badge
          className="mr-component min-w-[50px] justify-center border-transparent text-[0.7rem] text-[var(--color-text-on-accent)]"
          style={{ backgroundColor: delayBg }}
        >
          {proxy.delay > 0
            ? `${proxy.delay}ms`
            : t('shared.labels.timeout') || '超时'}
        </Badge>
      )}

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemove(proxy.id)}
        className="text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)]"
      >
        <Trash2 />
      </Button>
    </div>
  )
}

export const ProxyChain = ({
  proxyChain,
  onUpdateChain,
  chainConfigData,
  onMarkUnsavedChanges,
  mode,
  selectedGroup,
}: ProxyChainProps) => {
  const { t } = useTranslation()
  const chainWarning = t('proxies.page.chain.warning')
  const { proxies } = useProxiesData()
  const { refreshProxy } = useAppRefreshers()
  const [isConnecting, setIsConnecting] = useState(false)
  const markUnsavedChanges = useCallback(() => {
    onMarkUnsavedChanges?.()
  }, [onMarkUnsavedChanges])

  const isConnected = useMemo(() => {
    if (!proxies || proxyChain.length < 2) {
      return false
    }

    const lastNode = proxyChain[proxyChain.length - 1]

    if (mode === 'global') {
      return proxies.global?.now === lastNode.name
    }

    if (!selectedGroup || !Array.isArray(proxies.groups)) {
      return false
    }

    const proxyChainGroup = proxies.groups.find(
      (group: { name: string }) => group.name === selectedGroup,
    )

    return proxyChainGroup?.now === lastNode.name
  }, [proxies, proxyChain, mode, selectedGroup])

  // 监听链的变化，但排除从配置加载的情况
  const chainLengthRef = useRef(proxyChain.length)
  useEffect(() => {
    // 只有当链长度发生变化且不是初始加载时，才标记为未保存
    if (
      chainLengthRef.current !== proxyChain.length &&
      chainLengthRef.current !== 0
    ) {
      markUnsavedChanges()
    }
    chainLengthRef.current = proxyChain.length
  }, [proxyChain.length, markUnsavedChanges])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event

      if (active.id !== over?.id) {
        const oldIndex = proxyChain.findIndex((item) => item.id === active.id)
        const newIndex = proxyChain.findIndex((item) => item.id === over?.id)

        onUpdateChain(arrayMove(proxyChain, oldIndex, newIndex))
        markUnsavedChanges()
      }
    },
    [proxyChain, onUpdateChain, markUnsavedChanges],
  )

  const handleRemoveProxy = useCallback(
    (id: string) => {
      const newChain = proxyChain.filter((item) => item.id !== id)
      onUpdateChain(newChain)
      markUnsavedChanges()
    },
    [proxyChain, onUpdateChain, markUnsavedChanges],
  )

  const handleConnect = useCallback(async () => {
    if (isConnected) {
      setIsConnecting(true)
      try {
        await updateProxyChainConfigInRuntime(null)

        const targetGroup =
          mode === 'global'
            ? 'GLOBAL'
            : selectedGroup || localStorage.getItem('proxy-chain-group')

        if (targetGroup) {
          try {
            await selectNodeForGroup(targetGroup, 'DIRECT')
          } catch {
            if (proxyChain.length >= 1) {
              try {
                await selectNodeForGroup(targetGroup, proxyChain[0].name)
              } catch {
                // ignore
              }
            }
          }
        }

        localStorage.removeItem('proxy-chain-group')
        localStorage.removeItem('proxy-chain-exit-node')
        localStorage.removeItem('proxy-chain-items')

        await closeAllConnections()
        await refreshProxy()

        onUpdateChain([])
      } catch (error) {
        console.error('Failed to disconnect from proxy chain:', error)
        alert(t('proxies.page.chain.disconnectFailed') || '断开链式代理失败')
      } finally {
        setIsConnecting(false)
      }
      return
    }

    if (proxyChain.length < 2) {
      alert(t('proxies.page.chain.minimumNodes') || '链式代理至少需要2个节点')
      return
    }

    setIsConnecting(true)
    try {
      // 第一步：保存链式代理配置
      const chainProxies = proxyChain.map((node) => node.name)
      debugLog('Saving chain config:', chainProxies)
      await updateProxyChainConfigInRuntime(chainProxies)
      debugLog('Chain configuration saved successfully')

      // 第二步：连接到代理链的最后一个节点
      const lastNode = proxyChain[proxyChain.length - 1]
      debugLog(`Connecting to proxy chain, last node: ${lastNode.name}`)

      // 根据模式确定使用的代理组名称
      if (mode !== 'global' && !selectedGroup) {
        throw new Error('规则模式下必须选择代理组')
      }

      const targetGroup = mode === 'global' ? 'GLOBAL' : selectedGroup

      await selectNodeForGroup(targetGroup || 'GLOBAL', lastNode.name)
      localStorage.setItem('proxy-chain-group', targetGroup || 'GLOBAL')
      localStorage.setItem('proxy-chain-exit-node', lastNode.name)

      // 刷新代理信息以更新连接状态
      refreshProxy()
      debugLog('Successfully connected to proxy chain')
    } catch (error) {
      console.error('Failed to connect to proxy chain:', error)
      alert(t('proxies.page.chain.connectFailed') || '连接链式代理失败')
    } finally {
      setIsConnecting(false)
    }
  }, [
    proxyChain,
    isConnected,
    t,
    refreshProxy,
    mode,
    selectedGroup,
    onUpdateChain,
  ])

  const proxyChainRef = useRef(proxyChain)
  const onUpdateChainRef = useRef(onUpdateChain)

  useEffect(() => {
    proxyChainRef.current = proxyChain
    onUpdateChainRef.current = onUpdateChain
  }, [proxyChain, onUpdateChain])

  // 处理链式代理配置数据
  useEffect(() => {
    if (chainConfigData) {
      try {
        // JSON is valid YAML, so one parser covers both persisted formats.
        const parsedConfig = yaml.load(chainConfigData) as ParsedChainConfig
        const chainItems = toChainItems(parsedConfig)

        if (chainItems.length > 0) {
          onUpdateChain(chainItems)
        }
      } catch (error) {
        console.error('Failed to process chain config data:', error)
      }
    }
  }, [chainConfigData, onUpdateChain])

  // 定时更新延迟数据
  useEffect(() => {
    if (!proxies?.records) return

    const updateDelays = () => {
      const currentChain = proxyChainRef.current
      if (currentChain.length === 0) return

      const updatedChain = currentChain.map((item) => {
        const proxyRecord = proxies.records[item.name]
        if (
          proxyRecord &&
          proxyRecord.history &&
          proxyRecord.history.length > 0
        ) {
          const latestDelay =
            proxyRecord.history[proxyRecord.history.length - 1].delay
          return { ...item, delay: latestDelay }
        }
        return item
      })

      // 只有在延迟数据确实发生变化时才更新
      const hasChanged = updatedChain.some(
        (item, index) => item.delay !== currentChain[index]?.delay,
      )

      if (hasChanged) {
        onUpdateChainRef.current(updatedChain)
      }
    }

    // 立即更新一次延迟
    updateDelays()

    // 设置定时器，每5秒更新一次延迟
    const interval = setInterval(updateDelays, 5000)

    return () => clearInterval(interval)
  }, [proxies?.records]) // 只依赖proxies.records

  return (
    <div className="flex min-h-[360px] flex-col rounded-[var(--radius-card)] bg-[var(--color-bg-card)] p-inset shadow-[var(--shadow-card)]">
      <div className="mb-inset flex items-center justify-between">
        <div className="flex items-center gap-compact">
          <h6 className="text-[1.25rem] font-medium">
            {t('proxies.page.chain.header')}
          </h6>
          <TooltipIcon
            title={chainWarning}
            icon={TriangleAlert}
            className="size-7 text-[var(--color-warning)]"
          />
        </div>
        <div className="flex items-center gap-component">
          {proxyChain.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                updateProxyChainConfigInRuntime(null)
                localStorage.removeItem('proxy-chain-group')
                localStorage.removeItem('proxy-chain-exit-node')
                localStorage.removeItem('proxy-chain-items')
                onUpdateChain([])
              }}
              className="text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)]"
              title={
                t('proxies.page.actions.clearChainConfig') || '删除链式配置'
              }
            >
              <Trash2 />
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleConnect}
            disabled={
              isConnecting ||
              proxyChain.length < 2 ||
              (mode !== 'global' && !selectedGroup)
            }
            className={cn(
              'min-w-[90px] text-[var(--color-text-on-accent)] hover:opacity-90',
              isConnected
                ? 'bg-[var(--color-danger)]'
                : 'bg-[var(--color-success)]',
            )}
            title={
              proxyChain.length < 2
                ? t('proxies.page.chain.minimumNodes') ||
                  '链式代理至少需要2个节点'
                : undefined
            }
          >
            {isConnected ? <Unlink /> : <Link />}
            {isConnecting
              ? t('proxies.page.actions.connecting') || '连接中...'
              : isConnected
                ? t('proxies.page.actions.disconnect') || '断开'
                : t('proxies.page.actions.connect') || '连接'}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'mb-inset flex items-center gap-component rounded-[var(--radius-compact)] px-inset py-compact text-[14px]',
          proxyChain.length === 1
            ? 'bg-[var(--color-warning-subtle)] text-[var(--color-warning)]'
            : 'bg-[var(--color-info-subtle)] text-[var(--color-info)]',
        )}
      >
        {proxyChain.length === 1 ? (
          <TriangleAlert className="size-5 shrink-0" />
        ) : (
          <Info className="size-5 shrink-0" />
        )}
        <span>
          {proxyChain.length === 1
            ? t('proxies.page.chain.minimumNodesHint') ||
              '链式代理至少需要2个节点，请再添加一个节点。'
            : t('proxies.page.chain.instruction') ||
              '按顺序点击节点添加到代理链中'}
        </span>
      </div>

      <div className="min-h-[160px] flex-1">
        {proxyChain.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[var(--color-text-secondary)]">
            <p>{t('proxies.page.chain.empty')}</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={proxyChain.map((proxy) => proxy.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="min-h-[60px] rounded-[var(--radius-compact)] p-component">
                {proxyChain.map((proxy, index) => (
                  <div key={proxy.id}>
                    <SortableItem
                      proxy={proxy}
                      index={index}
                      isFirst={index === 0}
                      isLast={
                        index === proxyChain.length - 1 && proxyChain.length > 1
                      }
                      onRemove={handleRemoveProxy}
                    />
                    {index < proxyChain.length - 1 && (
                      <div className="flex justify-center py-0.5">
                        <ArrowDown className="size-5 text-[var(--color-accent)] opacity-70" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}
