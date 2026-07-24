import {
  ArrowDown,
  ArrowUp,
  CloudDownload,
  CloudUpload,
  Link,
  MemoryStick,
} from 'lucide-react'
import { ReactNode, memo, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { TrafficErrorBoundary } from '@/components/shared/traffic-error-boundary'
import { useConnectionSummaryData } from '@/hooks/use-connection-data'
import { useMemoryData } from '@/hooks/use-memory-data'
import { useTrafficData } from '@/hooks/use-traffic-data'
import { useVerge } from '@/hooks/use-verge'
import { useVisibility } from '@/hooks/use-visibility'
import { cn } from '@/lib/utils'
import parseTraffic from '@/utils/parse-traffic'

import {
  EnhancedCanvasTrafficGraph,
  type EnhancedCanvasTrafficGraphRef,
} from './enhanced-canvas-traffic-graph'

type StatColor =
  | 'primary'
  | 'secondary'
  | 'error'
  | 'warning'
  | 'info'
  | 'success'

interface StatCardProps {
  icon: ReactNode
  title: string
  value: string | number
  unit: string
  color: StatColor
  onClick?: () => void
}

// 卡片底色/描边（原 alpha(colorValue, .05/.15)）
const STAT_CARD_BASE: Record<StatColor, string> = {
  primary:
    'bg-[color-mix(in_srgb,var(--color-accent)_5%,transparent)] border-[color-mix(in_srgb,var(--color-accent)_15%,transparent)]',
  secondary:
    'bg-[color-mix(in_srgb,var(--color-secondary)_5%,transparent)] border-[color-mix(in_srgb,var(--color-secondary)_15%,transparent)]',
  error:
    'bg-[color-mix(in_srgb,var(--color-danger)_5%,transparent)] border-[color-mix(in_srgb,var(--color-danger)_15%,transparent)]',
  warning:
    'bg-[color-mix(in_srgb,var(--color-warning)_5%,transparent)] border-[color-mix(in_srgb,var(--color-warning)_15%,transparent)]',
  info: 'bg-[color-mix(in_srgb,var(--color-info)_5%,transparent)] border-[color-mix(in_srgb,var(--color-info)_15%,transparent)]',
  success:
    'bg-[color-mix(in_srgb,var(--color-success)_5%,transparent)] border-[color-mix(in_srgb,var(--color-success)_15%,transparent)]',
}

// 卡片 hover 底色/描边（仅可点击时，原 alpha(colorValue, .1/.3) + 阴影）
const STAT_CARD_HOVER: Record<StatColor, string> = {
  primary:
    'hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)] hover:shadow-[var(--shadow-card)]',
  secondary:
    'hover:bg-[color-mix(in_srgb,var(--color-secondary)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--color-secondary)_30%,transparent)] hover:shadow-[var(--shadow-card)]',
  error:
    'hover:bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] hover:shadow-[var(--shadow-card)]',
  warning:
    'hover:bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)] hover:shadow-[var(--shadow-card)]',
  info: 'hover:bg-[color-mix(in_srgb,var(--color-info)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--color-info)_30%,transparent)] hover:shadow-[var(--shadow-card)]',
  success:
    'hover:bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--color-success)_30%,transparent)] hover:shadow-[var(--shadow-card)]',
}

// 图标圆底/图标色（原 alpha(colorValue, .1) + 主色）
const STAT_ICON: Record<StatColor, string> = {
  primary:
    'text-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]',
  secondary:
    'text-[var(--color-secondary)] bg-[color-mix(in_srgb,var(--color-secondary)_10%,transparent)]',
  error:
    'text-[var(--color-danger)] bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)]',
  warning:
    'text-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)]',
  info: 'text-[var(--color-info)] bg-[color-mix(in_srgb,var(--color-info)_10%,transparent)]',
  success:
    'text-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)]',
}

// 全局变量类型定义
declare global {
  interface Window {
    animationFrameId?: number
    lastTrafficData?: {
      up: number
      down: number
    }
  }
}

// 统计卡片组件 - 使用memo优化
const CompactStatCard = memo(
  ({ icon, title, value, unit, color, onClick }: StatCardProps) => {
    const clickable = Boolean(onClick)

    return (
      <div
        onClick={onClick}
        className={cn(
          'flex items-center rounded-[var(--radius-card)] border p-component transition-all duration-[var(--duration-base)]',
          STAT_CARD_BASE[color],
          clickable ? 'cursor-pointer' : 'cursor-default',
          clickable && STAT_CARD_HOVER[color],
        )}
      >
        {/* 图标容器 */}
        <div
          className={cn(
            'mr-component ml-adjust flex size-8 shrink-0 items-center justify-center rounded-full',
            STAT_ICON[color],
          )}
        >
          {icon}
        </div>

        {/* 文本内容 */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-caption text-[var(--color-text-secondary)]">
            {title}
          </div>
          <div className="flex items-baseline">
            <span className="mr-inline truncate text-body-lg font-bold text-[var(--color-text-primary)]">
              {value}
            </span>
            <span className="text-caption text-[var(--color-text-secondary)]">
              {unit}
            </span>
          </div>
        </div>
      </div>
    )
  },
)

// 添加显示名称
CompactStatCard.displayName = 'CompactStatCard'

export const EnhancedTrafficStats = () => {
  const { t } = useTranslation()
  const { verge } = useVerge()
  const trafficRef = useRef<EnhancedCanvasTrafficGraphRef>(null)
  const pageVisible = useVisibility()

  // 是否显示流量图表
  const trafficGraph = verge?.traffic_graph ?? true
  const displayMemory = verge?.enable_memory_usage ?? true

  const {
    response: { data: traffic },
  } = useTrafficData({ enabled: pageVisible })

  const {
    response: { data: memory },
  } = useMemoryData({ enabled: displayMemory && pageVisible })

  const {
    response: { data: connectionSummary },
  } = useConnectionSummaryData({ enabled: pageVisible })

  // Canvas组件现在直接从全局Hook获取数据，无需手动添加数据点

  // 使用useMemo计算解析后的流量数据
  const parsedData = useMemo(() => {
    const [up, upUnit] = parseTraffic(traffic?.up || 0)
    const [down, downUnit] = parseTraffic(traffic?.down || 0)
    const [inuse, inuseUnit] = parseTraffic(memory?.inuse || 0)
    const [uploadTotal, uploadTotalUnit] = parseTraffic(traffic?.upTotal || 0)
    const [downloadTotal, downloadTotalUnit] = parseTraffic(
      traffic?.downTotal || 0,
    )

    return {
      up,
      upUnit,
      down,
      downUnit,
      inuse,
      inuseUnit,
      uploadTotal,
      uploadTotalUnit,
      downloadTotal,
      downloadTotalUnit,
      connectionsCount: connectionSummary?.activeConnectionCount,
    }
  }, [traffic, memory, connectionSummary])

  // 渲染流量图表 - 使用useMemo缓存渲染结果
  const trafficGraphComponent = useMemo(() => {
    if (!trafficGraph || !pageVisible) return null

    return (
      <div
        className="h-[130px] cursor-pointer overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]"
        onClick={() => trafficRef.current?.toggleStyle()}
      >
        <div className="relative h-full">
          <EnhancedCanvasTrafficGraph ref={trafficRef} />
        </div>
      </div>
    )
  }, [trafficGraph, pageVisible])

  // 使用useMemo计算统计卡片配置
  const statCards = useMemo(() => {
    const cards: StatCardProps[] = [
      {
        icon: <ArrowUp className="size-5" />,
        title: t('home.components.traffic.metrics.uploadSpeed'),
        value: parsedData.up,
        unit: `${parsedData.upUnit}/s`,
        color: 'secondary' as const,
      },
      {
        icon: <ArrowDown className="size-5" />,
        title: t('home.components.traffic.metrics.downloadSpeed'),
        value: parsedData.down,
        unit: `${parsedData.downUnit}/s`,
        color: 'primary' as const,
      },
      {
        icon: <Link className="size-5" />,
        title: t('home.components.traffic.metrics.activeConnections'),
        value: parsedData.connectionsCount,
        unit: '',
        color: 'success' as const,
      },
      {
        icon: <CloudUpload className="size-5" />,
        title: t('shared.labels.uploaded'),
        value: parsedData.uploadTotal,
        unit: parsedData.uploadTotalUnit,
        color: 'secondary' as const,
      },
      {
        icon: <CloudDownload className="size-5" />,
        title: t('shared.labels.downloaded'),
        value: parsedData.downloadTotal,
        unit: parsedData.downloadTotalUnit,
        color: 'primary' as const,
      },
    ]

    if (displayMemory) {
      cards.push({
        icon: <MemoryStick className="size-5" />,
        title: t('home.components.traffic.metrics.memoryUsage'),
        value: parsedData.inuse,
        unit: parsedData.inuseUnit,
        color: 'error' as const,
      })
    }

    return cards
  }, [t, parsedData, displayMemory])

  return (
    <TrafficErrorBoundary
      onError={(error, errorInfo) => {
        console.error('[EnhancedTrafficStats] 组件错误:', error, errorInfo)
      }}
    >
      <div className="grid grid-cols-2 gap-component md:grid-cols-3">
        {trafficGraph && (
          <div className="col-span-full">{trafficGraphComponent}</div>
        )}
        {/* 统计卡片区域 */}
        {statCards.map((card) => (
          <CompactStatCard key={card.title} {...card} />
        ))}
      </div>
    </TrafficErrorBoundary>
  )
}
