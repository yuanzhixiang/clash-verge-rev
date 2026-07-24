import { useCallback, useEffect, useMemo, useRef } from 'react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ProxyGroupNavigatorProps {
  proxyGroupNames: string[]
  onGroupLocation: (groupName: string) => void
  enableHoverJump?: boolean
  hoverDelay?: number
}

export const DEFAULT_HOVER_DELAY = 280

// 提取代理组名的第一个字符
const getGroupDisplayChar = (groupName: string): string => {
  if (!groupName) return '?'

  // 直接返回第一个字符，支持表情符号
  const firstChar = Array.from(groupName)[0]
  return firstChar || '?'
}

export const ProxyGroupNavigator = ({
  proxyGroupNames,
  onGroupLocation,
  enableHoverJump = true,
  hoverDelay = DEFAULT_HOVER_DELAY,
}: ProxyGroupNavigatorProps) => {
  const lastHoveredRef = useRef<string | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hoverDelayMs = hoverDelay >= 0 ? hoverDelay : 0

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!enableHoverJump) {
      clearHoverTimer()
      lastHoveredRef.current = null
    }
    return () => {
      clearHoverTimer()
    }
  }, [clearHoverTimer, enableHoverJump])

  const handleGroupClick = useCallback(
    (groupName: string) => {
      clearHoverTimer()
      lastHoveredRef.current = groupName
      onGroupLocation(groupName)
    },
    [clearHoverTimer, onGroupLocation],
  )

  const handleGroupHover = useCallback(
    (groupName: string) => {
      if (!enableHoverJump) return
      if (lastHoveredRef.current === groupName) return
      clearHoverTimer()
      hoverTimerRef.current = setTimeout(() => {
        hoverTimerRef.current = null
        lastHoveredRef.current = groupName
        onGroupLocation(groupName)
      }, hoverDelayMs)
    },
    [clearHoverTimer, enableHoverJump, hoverDelayMs, onGroupLocation],
  )

  const handleButtonLeave = useCallback(() => {
    clearHoverTimer()
    lastHoveredRef.current = null
  }, [clearHoverTimer])

  // 处理代理组数据，去重和排序
  const processedGroups = useMemo(() => {
    return proxyGroupNames
      .filter((name) => name && name.trim())
      .map((name) => ({
        name,
        displayChar: getGroupDisplayChar(name),
      }))
  }, [proxyGroupNames])

  if (processedGroups.length === 0) {
    return null
  }

  return (
    <div className="absolute top-1/2 right-0.5 z-10 flex max-h-[70vh] min-w-0 -translate-y-1/2 flex-col gap-adjust overflow-y-auto rounded-[var(--radius-control)] p-adjust [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {processedGroups.map(({ name, displayChar }) => (
        <Tooltip key={name}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleGroupClick(name)}
              onMouseEnter={() => handleGroupHover(name)}
              onFocus={() => handleGroupHover(name)}
              onMouseLeave={handleButtonLeave}
              onBlur={handleButtonLeave}
              className="size-7 min-w-0 rounded-[var(--radius-compact)] p-0 text-xs font-semibold text-[var(--color-text-secondary)] normal-case hover:bg-[var(--color-accent)] hover:text-[var(--color-text-on-accent)]"
            >
              {displayChar}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{name}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
