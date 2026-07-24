import { ArrowDown, ArrowUp, MemoryStick } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { LightweightTrafficErrorBoundary } from '@/components/shared/traffic-error-boundary'
import { useMemoryData } from '@/hooks/use-memory-data'
import { useTrafficData } from '@/hooks/use-traffic-data'
import { useVerge } from '@/hooks/use-verge'
import { useVisibility } from '@/hooks/use-visibility'
import { cn } from '@/lib/utils'
import parseTraffic from '@/utils/parse-traffic'

import { TrafficGraph, type TrafficRef } from './traffic-graph'

const rowCls = 'flex items-center whitespace-nowrap'
const iconCls = 'mr-component size-4'
const valCls = 'flex-[1_1_56px] select-none text-center'
const unitCls =
  'flex-[0_1_27px] select-none text-right text-caption text-[var(--color-text-muted)]'

// setup the traffic
export const LayoutTraffic = () => {
  const { t } = useTranslation()
  const { verge } = useVerge()

  // whether hide traffic graph
  const trafficGraph = verge?.traffic_graph ?? true
  const displayMemory = verge?.enable_memory_usage ?? true

  const trafficRef = useRef<TrafficRef>(null)
  const pageVisible = useVisibility()

  const {
    response: { data: traffic },
  } = useTrafficData({ enabled: pageVisible })
  const {
    response: { data: memory },
  } = useMemoryData({ enabled: displayMemory && pageVisible })

  // 监听数据变化，为图表添加数据点
  useEffect(() => {
    if (trafficRef.current) {
      trafficRef.current.appendData({
        up: traffic?.up || 0,
        down: traffic?.down || 0,
        upTotal: traffic?.upTotal || 0,
        downTotal: traffic?.downTotal || 0,
      })
    }
  }, [traffic])

  // 使用parseTraffic统一处理转换，保持与首页一致的显示格式
  const [up, upUnit] = parseTraffic(traffic?.up || 0)
  const [down, downUnit] = parseTraffic(traffic?.down || 0)
  const [inuse, inuseUnit] = parseTraffic(memory?.inuse || 0)

  const upActive = (traffic?.up || 0) > 0
  const downActive = (traffic?.down || 0) > 0

  return (
    <LightweightTrafficErrorBoundary>
      <div className="relative">
        {trafficGraph && pageVisible && (
          <div
            className="mb-compact h-[60px] w-full"
            onClick={trafficRef.current?.toggleStyle}
          >
            <TrafficGraph ref={trafficRef} />
          </div>
        )}

        <div className="flex flex-col gap-compact">
          <div
            className={rowCls}
            title={`${t('home.components.traffic.metrics.uploadSpeed')}`}
          >
            <ArrowUp
              className={cn(
                iconCls,
                upActive
                  ? 'text-[var(--color-secondary)]'
                  : 'text-[var(--color-text-disabled)]',
              )}
            />
            <span className={cn(valCls, 'text-[var(--color-secondary)]')}>
              {up}
            </span>
            <span className={unitCls}>{upUnit}/s</span>
          </div>

          <div
            className={rowCls}
            title={`${t('home.components.traffic.metrics.downloadSpeed')}`}
          >
            <ArrowDown
              className={cn(
                iconCls,
                downActive
                  ? 'text-[var(--color-accent)]'
                  : 'text-[var(--color-text-disabled)]',
              )}
            />
            <span className={cn(valCls, 'text-[var(--color-accent)]')}>
              {down}
            </span>
            <span className={unitCls}>{downUnit}/s</span>
          </div>

          {displayMemory && (
            <div
              className={cn(rowCls, 'cursor-auto')}
              title={`${t('home.components.traffic.metrics.memoryUsage')} `}
              onClick={async () => {
                // isDebug && (await gc());
              }}
            >
              <MemoryStick className={iconCls} />
              <span className={valCls}>{inuse}</span>
              <span className={unitCls}>{inuseUnit}</span>
            </div>
          )}
        </div>
      </div>
    </LightweightTrafficErrorBoundary>
  )
}
