import { useLockFn } from 'ahooks'
import { ArrowLeftRight, Globe, Signpost } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type BaseConfig, closeAllConnections } from 'tauri-plugin-mihomo-api'

import { useClashMode, useRuntimeConfig } from '@/hooks/use-clash'
import { useVerge } from '@/hooks/use-verge'
import { cn } from '@/lib/utils'
import {
  useAppRefreshers,
  useClashConfigData,
  useCoreDataStatus,
} from '@/providers/app-data-context'
import { patchClashMode } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import { setCacheData } from '@/services/query-client'
import type { TranslationKey } from '@/types/generated/i18n-keys'

const CLASH_MODES = ['rule', 'global', 'direct'] as const
type ClashMode = (typeof CLASH_MODES)[number]

const isClashMode = (mode: string): mode is ClashMode =>
  (CLASH_MODES as readonly string[]).includes(mode)

const toClashMode = (mode?: string | null) => {
  const normalized = mode?.toLowerCase()
  return normalized && isClashMode(normalized) ? normalized : undefined
}

const MODE_META: Record<
  ClashMode,
  { label: TranslationKey; description: TranslationKey }
> = {
  rule: {
    label: 'home.components.clashMode.labels.rule',
    description: 'home.components.clashMode.descriptions.rule',
  },
  global: {
    label: 'home.components.clashMode.labels.global',
    description: 'home.components.clashMode.descriptions.global',
  },
  direct: {
    label: 'home.components.clashMode.labels.direct',
    description: 'home.components.clashMode.descriptions.direct',
  },
}

const MODE_ICONS: Record<ClashMode, ReactNode> = {
  rule: <ArrowLeftRight className="size-5" />,
  global: <Globe className="size-5" />,
  direct: <Signpost className="size-5" />,
}

export const ClashModeCard = () => {
  const { t } = useTranslation()
  const { verge } = useVerge()
  const { clashConfig } = useClashConfigData()
  const { isCoreDataPending } = useCoreDataStatus()
  const { refreshClashConfig } = useAppRefreshers()

  // 点击后到后端确认前的乐观模式，使按钮立即响应
  const [optimisticMode, setOptimisticMode] = useState<ClashMode | null>(null)

  // 主源：mihomo /configs 的实时 mode（最准，但依赖严格反序列化，可能整体失败）
  const controllerMode = toClashMode(clashConfig?.mode)
  // 主源不可用时，启用两个容错兜底来源
  const needFallback = !controllerMode
  const { data: runtimeConfig, isPending: isRuntimeConfigPending } =
    useRuntimeConfig(needFallback)
  const runtimeMode = toClashMode(runtimeConfig?.mode)
  const {
    data: backendMode,
    isPending: isBackendModePending,
    refetch: refetchBackendMode,
  } = useClashMode(needFallback)
  // backendMode（已保存 clash 配置）在每次切换时都会被 change_clash_mode 同步更新，
  // 而 runtimeMode（生成的运行时配置）在 API 切换后不会刷新、可能陈旧，
  // 因此优先用 backendMode，避免陈旧 runtime mode 遮住新值。
  const fallbackMode = toClashMode(backendMode) ?? runtimeMode

  const resolvedMode = controllerMode ?? fallbackMode
  const currentMode = optimisticMode ?? resolvedMode

  const modeDescription = currentMode
    ? t(MODE_META[currentMode].description)
    : isCoreDataPending || isRuntimeConfigPending || isBackendModePending
      ? '\u00A0'
      : t('home.components.clashMode.errors.communication')

  // 切换模式的处理函数：乐观更新 + 真实失败回滚并提示
  const onChangeMode = useLockFn(async (mode: ClashMode) => {
    if (mode === currentMode) return
    if (verge?.auto_close_connection) {
      closeAllConnections()
    }

    // 乐观置为目标模式，按钮立即反映点击
    setOptimisticMode(mode)
    try {
      // patchClashMode 现在会在后端 PATCH 失败时 reject
      await patchClashMode(mode)
    } catch (error) {
      // 真实失败：回滚乐观状态并提示用户
      setOptimisticMode(null)
      showNotice.error(error)
      return
    }

    // 成功：写穿主源缓存，使实时 mode 立即反映新值——即使随后的 /configs refetch
    // 失败（TanStack 会保留旧 data），controllerMode 也不会再压过新值导致闪回。
    // 若主源从未成功过（old 为 undefined）则保持不动，改由兜底来源反映。
    setCacheData<BaseConfig>(['getClashConfig'], (old) =>
      old ? { ...old, mode } : old,
    )
    // 刷新主源与兜底源以与后端对齐，待数据落地后再清除乐观状态
    await Promise.allSettled([refreshClashConfig(), refetchBackendMode()])
    setOptimisticMode(null)
  })

  return (
    <div className="flex w-full flex-col">
      {/* 模式选择按钮组 */}
      <div className="relative z-[2] flex justify-center gap-component py-component">
        {CLASH_MODES.map((mode) => {
          const selected = mode === currentMode
          return (
            <div
              key={mode}
              onClick={() => onChangeMode(mode)}
              className={cn(
                'relative flex cursor-pointer items-center justify-center gap-component rounded-[var(--radius-control)] px-inset py-component transition-all duration-[var(--duration-base)] ease-in-out hover:-translate-y-px active:translate-y-px',
                selected
                  ? "bg-[var(--color-accent)] text-[var(--color-text-on-accent)] shadow-[var(--shadow-card)] after:absolute after:-bottom-4 after:left-1/2 after:h-4 after:w-0.5 after:-translate-x-1/2 after:bg-[var(--color-accent)] after:content-['']"
                  : 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] hover:shadow-[var(--shadow-card)]',
              )}
            >
              {MODE_ICONS[mode]}
              <span
                className={cn(
                  'text-body capitalize',
                  selected ? 'font-semibold' : 'font-normal',
                )}
              >
                {t(MODE_META[mode].label)}
              </span>
            </div>
          )
        })}
      </div>

      {/* 说明文本区域 */}
      <div className="relative my-component flex w-full justify-center">
        <div className="w-[95%] break-words hyphens-auto rounded-[var(--radius-compact)] border border-[var(--color-accent)] bg-[var(--color-bg-card)] p-compact text-center text-caption text-[var(--color-text-secondary)]">
          {modeDescription}
        </div>
      </div>
    </div>
  )
}
