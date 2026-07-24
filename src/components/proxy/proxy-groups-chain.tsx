import { ChevronDown } from 'lucide-react'
import {
  type Key,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { updateProxyChainConfigInRuntime } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

import { ScrollTopButton } from '../layout/scroll-top-button'

import { ProxyChain } from './proxy-chain'
import { ProxyRender } from './proxy-render'
import type { HeadState } from './use-head-state'
import type { IRenderItem } from './use-render-list'

// ---- Types ----

interface ProxyChainItem {
  id: string
  name: string
  type?: string
  delay?: number
}

type VirtualListItem = {
  key: Key
  index: number
  start: number
  end: number
}

interface ProxyGroupOption {
  name: string
  type: string
  all?: unknown[]
}

// ---- Props ----

interface ChainRuleHeaderProps {
  title: string
  selectLabel: string
  currentGroup: ProxyGroupOption | null
  canSelectGroup: boolean
  groups: ProxyGroupOption[]
  selectedGroup: string | null
  emptyText: string
  onSelect: (groupName: string) => void
}

interface ProxyGroupsChainProps {
  mode: string
  chainConfigData?: string | null
  availableGroups: any[]
  activeSelectedGroup: string | null
  showScrollTop: boolean

  // Virtual list data (from parent's virtualizer)
  listRef: RefObject<HTMLDivElement | null>
  scrollMargin: number
  totalSize: number
  virtualItems: VirtualListItem[]
  renderList: IRenderItem[]
  activeStickyIndex: number | null
  measureElement: (node: Element | null) => void

  // Shared callbacks
  onCheckAll: (groupName: string) => void
  onHeadState: (groupName: string, patch: Partial<HeadState>) => void
  onLocation: (group: any) => void
  onGroupSelect: (groupName: string) => void
  onScrollToTop: () => void
}

// ---- Sub-components ----

function ChainRuleHeader({
  title,
  selectLabel,
  currentGroup,
  canSelectGroup,
  groups,
  selectedGroup,
  emptyText,
  onSelect,
}: ChainRuleHeaderProps) {
  return (
    <div className="border-b border-[var(--color-border)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-inset py-stack">
        <div className="flex items-center gap-inset">
          <span className="text-h3 font-semibold text-[var(--color-text-primary)]">
            {title}
          </span>

          {currentGroup && (
            <Badge variant="outline" className="max-w-[200px]">
              <span className="truncate">
                {`${currentGroup.name} (${currentGroup.type})`}
              </span>
            </Badge>
          )}
        </div>

        {canSelectGroup && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-inline rounded-[var(--radius-compact)] text-xs font-normal"
              >
                {selectLabel}
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-[300px] min-w-[200px] overflow-y-auto"
            >
              {groups.map((group) => (
                <DropdownMenuItem
                  key={group.name}
                  onSelect={() => onSelect(group.name)}
                  className={cn(
                    'flex flex-col items-start',
                    selectedGroup === group.name &&
                      'bg-[var(--color-bg-active)]',
                  )}
                >
                  <span className="text-label font-medium">{group.name}</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    {group.type} · {group.all?.length ?? 0} 节点
                  </span>
                </DropdownMenuItem>
              ))}

              {groups.length === 0 && (
                <DropdownMenuItem disabled>
                  <span className="text-body text-[var(--color-text-secondary)]">
                    {emptyText}
                  </span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

function ProxyVirtualList({
  listRef,
  scrollMargin,
  totalSize,
  virtualItems,
  renderList,
  activeStickyIndex,
  isChainMode,
  measureElement,
  onLocation,
  onCheckAll,
  onHeadState,
  onChangeProxy,
}: {
  listRef: RefObject<HTMLDivElement | null>
  scrollMargin: number
  totalSize: number
  virtualItems: VirtualListItem[]
  renderList: IRenderItem[]
  activeStickyIndex: number | null
  isChainMode?: boolean
  measureElement: (node: Element | null) => void
  onLocation: (group: any) => void
  onCheckAll: (groupName: string) => void
  onHeadState: (groupName: string, patch: Partial<HeadState>) => void
  onChangeProxy: (group: IProxyGroupItem, proxy: IProxyItem) => void
}) {
  const stickyBackground = 'var(--color-bg-page)'
  const listHeight = Math.max(totalSize, 240)

  return (
    <div ref={listRef} style={{ height: listHeight, position: 'relative' }}>
      {virtualItems.map((virtualItem) => (
        <div
          key={virtualItem.key}
          data-index={virtualItem.index}
          ref={measureElement}
          style={{
            position:
              virtualItem.index === activeStickyIndex ? 'sticky' : 'absolute',
            top: 0,
            left: 0,
            zIndex: virtualItem.index === activeStickyIndex ? 5 : undefined,
            display:
              virtualItem.index === activeStickyIndex ? 'flow-root' : undefined,
            backgroundColor:
              virtualItem.index === activeStickyIndex
                ? stickyBackground
                : undefined,
            width: '100%',
            transform:
              virtualItem.index === activeStickyIndex
                ? undefined
                : `translateY(${virtualItem.start - scrollMargin}px)`,
          }}
        >
          <ProxyRender
            item={renderList[virtualItem.index]}
            onLocation={onLocation}
            onCheckAll={onCheckAll}
            onHeadState={onHeadState}
            onChangeProxy={onChangeProxy}
            isChainMode={isChainMode}
          />
        </div>
      ))}
    </div>
  )
}

// ---- Main Chain Component ----

export function ProxyGroupsChain(props: ProxyGroupsChainProps) {
  const { t } = useTranslation()
  const {
    mode,
    chainConfigData,
    availableGroups,
    activeSelectedGroup,
    showScrollTop,
    listRef,
    scrollMargin,
    totalSize,
    virtualItems,
    renderList,
    activeStickyIndex,
    measureElement,
    onCheckAll,
    onHeadState,
    onLocation,
    onGroupSelect,
    onScrollToTop,
  } = props

  // Chain-specific state
  const [proxyChain, setProxyChain] = useState<ProxyChainItem[]>(() => {
    try {
      const saved = localStorage.getItem('proxy-chain-items')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch {
      // ignore
    }
    return []
  })

  useEffect(() => {
    if (proxyChain.length > 0) {
      localStorage.setItem('proxy-chain-items', JSON.stringify(proxyChain))
    } else {
      localStorage.removeItem('proxy-chain-items')
    }
  }, [proxyChain])

  // Compute current group for rule header
  const currentGroup = useMemo(() => {
    if (!activeSelectedGroup) return null
    return (
      availableGroups.find(
        (group: any) => group.name === activeSelectedGroup,
      ) ?? null
    )
  }, [activeSelectedGroup, availableGroups])

  // Handlers
  const handleGroupSelect = (groupName: string) => {
    onGroupSelect(groupName)

    if (mode === 'rule') {
      updateProxyChainConfigInRuntime(null)
      localStorage.removeItem('proxy-chain-group')
      localStorage.removeItem('proxy-chain-exit-node')
      localStorage.removeItem('proxy-chain-items')
      setProxyChain([])
    }
  }

  const handleChangeProxy = useCallback(
    (_group: IProxyGroupItem, proxy: IProxyItem) => {
      // 使用函数式更新来避免状态延迟问题
      setProxyChain((prev) => {
        // 检查是否已经存在相同名称的代理，防止重复添加
        if (prev.some((item) => item.name === proxy.name)) {
          showNotice.warning('proxies.page.chain.duplicateNode')
          return prev // 返回原来的状态，不做任何更改
        }

        // 安全获取延迟数据，如果没有延迟数据则设为 undefined
        const delay =
          proxy.history && proxy.history.length > 0
            ? proxy.history[proxy.history.length - 1].delay
            : undefined

        const chainItem: ProxyChainItem = {
          id: `${proxy.name}_${Date.now()}`,
          name: proxy.name,
          type: proxy.type,
          delay,
        }

        return [...prev, chainItem]
      })
    },
    [],
  )

  // Render virtual list for chain mode
  const renderProxyList = () => (
    <ProxyVirtualList
      listRef={listRef}
      scrollMargin={scrollMargin}
      totalSize={totalSize}
      virtualItems={virtualItems}
      renderList={renderList}
      activeStickyIndex={activeStickyIndex}
      isChainMode
      measureElement={measureElement}
      onLocation={onLocation}
      onCheckAll={onCheckAll}
      onHeadState={onHeadState}
      onChangeProxy={handleChangeProxy}
    />
  )

  const showRuleHeader = mode === 'rule' && availableGroups.length > 0

  return (
    <div className="flex items-start gap-inset">
      <div className="relative min-w-0 flex-1">
        {showRuleHeader && (
          <ChainRuleHeader
            title={t('proxies.page.rules.title')}
            selectLabel={t('proxies.page.rules.select')}
            currentGroup={currentGroup}
            canSelectGroup={availableGroups.length > 0}
            groups={availableGroups}
            selectedGroup={activeSelectedGroup}
            emptyText="暂无可用代理组"
            onSelect={handleGroupSelect}
          />
        )}

        {renderProxyList()}
        <ScrollTopButton
          show={showScrollTop}
          onClick={onScrollToTop}
          className="fixed bottom-inset z-10 md:right-[440px]"
        />
      </div>

      <div className="w-[400px] min-w-[300px] flex-none self-start">
        <ProxyChain
          proxyChain={proxyChain}
          onUpdateChain={setProxyChain}
          chainConfigData={chainConfigData}
          mode={mode}
          selectedGroup={activeSelectedGroup}
        />
      </div>
    </div>
  )
}
