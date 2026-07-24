import { CircuitBoard } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Separator } from '@/components/ui/separator'
import { useClash } from '@/hooks/use-clash'
import {
  useClashConfigData,
  useRulesData,
  useSystemData,
  useUptimeData,
} from '@/providers/app-data-context'

import { EnhancedCard } from './enhanced-card'

// 将毫秒转换为时:分:秒格式的函数
const formatUptime = (uptimeMs: number) => {
  const hours = Math.floor(uptimeMs / 3600000)
  const minutes = Math.floor((uptimeMs % 3600000) / 60000)
  const seconds = Math.floor((uptimeMs % 60000) / 1000)
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export const ClashInfoCard = () => {
  const { t } = useTranslation()
  const { version: clashVersion } = useClash()
  const { clashConfig } = useClashConfigData()
  const { rules } = useRulesData()
  const { uptime } = useUptimeData()
  const { systemProxyAddress } = useSystemData()

  // 使用useMemo缓存格式化后的uptime，避免频繁计算
  const formattedUptime = useMemo(() => formatUptime(uptime), [uptime])

  // 使用备忘录组件内容，减少重新渲染
  const cardContent = useMemo(() => {
    if (!clashConfig) return null

    const rows: Array<{ label: string; value: ReactNode }> = [
      {
        label: t('home.components.clashInfo.fields.coreVersion'),
        value: clashVersion || '-',
      },
      {
        label: t('home.components.clashInfo.fields.systemProxyAddress'),
        value: systemProxyAddress,
      },
      {
        label: t('home.components.clashInfo.fields.mixedPort'),
        value: clashConfig.mixedPort || '-',
      },
      {
        label: t('home.components.clashInfo.fields.uptime'),
        value: formattedUptime,
      },
      {
        label: t('home.components.clashInfo.fields.rulesCount'),
        value: rules.length,
      },
    ]

    return (
      <div className="flex flex-col gap-stack">
        {rows.map((row, index) => (
          <div key={row.label}>
            <div className="flex items-center justify-between">
              <span className="text-body text-[var(--color-text-secondary)]">
                {row.label}
              </span>
              <span className="text-body font-medium text-[var(--color-text-primary)]">
                {row.value}
              </span>
            </div>
            {index < rows.length - 1 && <Separator className="mt-stack" />}
          </div>
        ))}
      </div>
    )
  }, [
    clashConfig,
    clashVersion,
    t,
    formattedUptime,
    rules.length,
    systemProxyAddress,
  ])

  return (
    <EnhancedCard
      title={t('home.components.clashInfo.title')}
      icon={<CircuitBoard className="size-5" />}
      iconColor="warning"
      action={null}
    >
      {cardContent}
    </EnhancedCard>
  )
}
