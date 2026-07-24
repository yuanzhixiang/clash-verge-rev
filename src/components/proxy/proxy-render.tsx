import { ChevronDown, ChevronUp, Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useIconCache } from '@/hooks/use-icon-cache'
import { useVerge } from '@/hooks/use-verge'
import { cn } from '@/lib/utils'

import { ProxyGroupTools } from './proxy-group-tools'
import { ProxyHead } from './proxy-head'
import { ProxyItem } from './proxy-item'
import { ProxyItemMini } from './proxy-item-mini'
import type { HeadState } from './use-head-state'
import type { IRenderItem } from './use-render-list'

interface RenderProps {
  item: IRenderItem
  stickyed?: boolean
  isChainMode?: boolean
  onLocation: (group: IRenderItem['group']) => void
  onCheckAll: (groupName: string) => void
  onHeadState: (groupName: string, patch: Partial<HeadState>) => void
  onChangeProxy: (
    group: IRenderItem['group'],
    proxy: IRenderItem['proxy'] & { name: string },
  ) => void
  onGroupToggle?: (group: IRenderItem['group']) => void
}

// 组名标题
function StyledPrimary({ children }: { children: ReactNode }) {
  return (
    <span className="block truncate text-h3 leading-[1.5] font-bold">
      {children}
    </span>
  )
}

// 组当前节点副标题
function StyledSubtitle({ children }: { children: ReactNode }) {
  return (
    <span className="truncate text-label text-[var(--color-text-secondary)]">
      {children}
    </span>
  )
}

// 主色描边标签
function StyledTypeBox({ children }: { children: ReactNode }) {
  return (
    <span className="mr-component inline-block rounded-[var(--radius-container)] border border-[color-mix(in_srgb,var(--color-accent)_50%,transparent)] px-inline text-[10px] leading-[1.5] text-[color-mix(in_srgb,var(--color-accent)_80%,transparent)]">
      {children}
    </span>
  )
}

export const ProxyRender = memo(function ProxyRender(props: RenderProps) {
  const { t } = useTranslation()
  const {
    item,
    stickyed = false,
    onLocation,
    onCheckAll,
    onHeadState,
    onChangeProxy,
    onGroupToggle,
    isChainMode: _ = false,
  } = props
  const { type, group, headState, proxy, proxyCol } = item
  const { verge } = useVerge()
  const enable_group_icon = verge?.enable_group_icon ?? true
  const iconCachePath = useIconCache({
    icon: group.icon,
    cacheKey: group.name.replaceAll(' ', ''),
    enabled: enable_group_icon,
  })

  const showType = headState?.showType
  const proxyColItemsMemo = useMemo(() => {
    if (type !== 4 || !proxyCol) {
      return null
    }

    return proxyCol.map((proxyItem) => (
      <ProxyItemMini
        key={`${item.key}-${proxyItem?.name ?? 'unknown'}`}
        group={group}
        proxy={proxyItem}
        selected={group.now === proxyItem?.name}
        showType={showType}
        onClick={() => onChangeProxy(group, proxyItem)}
      />
    ))
  }, [type, proxyCol, item.key, group, showType, onChangeProxy])

  if (type === 0) {
    return (
      <div className="px-component py-inline">
        <div
          className={cn(
            'flex h-full w-full cursor-pointer items-center rounded-[var(--radius-control)] bg-[var(--color-bg-card)] px-inset',
            stickyed && headState?.open && 'shadow-[var(--shadow-dropdown)]',
          )}
          onClick={() => {
            if (headState?.open) {
              onGroupToggle?.(group)
            }
            onHeadState?.(group.name, { open: !headState?.open })
          }}
        >
          <div className="w-full">
            <div className="flex w-full items-center">
              {enable_group_icon && group.icon?.trim().startsWith('http') && (
                <img
                  src={iconCachePath === '' ? group.icon : iconCachePath}
                  alt="group icon"
                  width="32px"
                  className="mr-stack rounded-[var(--radius-compact)]"
                />
              )}
              {enable_group_icon && group.icon?.trim().startsWith('data') && (
                <img
                  src={group.icon}
                  alt="group icon"
                  width="32px"
                  className="mr-stack rounded-[var(--radius-compact)]"
                />
              )}
              {enable_group_icon && group.icon?.trim().startsWith('<svg') && (
                <img
                  src={`data:image/svg+xml;base64,${btoa(group.icon)}`}
                  alt="group icon"
                  width="32px"
                />
              )}
              <div className="min-w-0 flex-initial">
                <StyledPrimary>{group.name}</StyledPrimary>
                <div className="flex items-center overflow-hidden pt-adjust whitespace-nowrap text-[var(--color-text-secondary)]">
                  <span className="mt-adjust overflow-hidden text-ellipsis">
                    <StyledTypeBox>{group.type}</StyledTypeBox>
                    <StyledSubtitle>{group.now}</StyledSubtitle>
                  </span>
                </div>
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-end">
                <ProxyGroupTools
                  url={group.testUrl}
                  groupName={group.name}
                  headState={headState!}
                  onLocation={() => onLocation(group)}
                  onCheckDelay={() => onCheckAll(group.name)}
                  onHeadState={(p) => onHeadState(group.name, p)}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex min-w-[50px] items-center justify-end">
                      <Badge className="mr-component border-transparent bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
                        {`${group.all.length}`}
                      </Badge>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t('proxies.page.labels.proxyCount')}
                  </TooltipContent>
                </Tooltip>
                {headState?.open ? (
                  <ChevronUp className="size-5" />
                ) : (
                  <ChevronDown className="size-5" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (type === 1) {
    return (
      <ProxyHead
        className="mt-inline mb-component pr-block pl-inset"
        url={group.testUrl}
        groupName={group.name}
        headState={headState!}
        onLocation={() => onLocation(group)}
        onCheckDelay={() => onCheckAll(group.name)}
        onHeadState={(p) => onHeadState(group.name, p)}
      />
    )
  }

  if (type === 2) {
    return (
      <ProxyItem
        group={group}
        proxy={proxy!}
        selected={group.now === proxy?.name}
        showType={headState?.showType}
        className="py-0 pl-inset"
        onClick={() => onChangeProxy(group, proxy!)}
      />
    )
  }

  if (type === 3) {
    return (
      <div className="flex flex-col items-center justify-center py-block pl-0">
        <Inbox className="size-10" />
        <span>No Proxies</span>
      </div>
    )
  }

  if (type === 4) {
    return (
      <div
        className="my-inline grid h-14 gap-component px-inset"
        style={{
          gridTemplateColumns: `repeat(${item.col! || 2}, 1fr)`,
        }}
      >
        {proxyColItemsMemo}
      </div>
    )
  }

  return null
})
