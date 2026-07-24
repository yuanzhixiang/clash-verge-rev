import { useLockFn, useRequest } from 'ahooks'
import { Trash2 } from 'lucide-react'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, Switch } from '@/components/base'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useClash } from '@/hooks/use-clash'
import { restartCore } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

// 定义开发环境的URL列表
// 这些URL在开发模式下会被自动包含在允许的来源中
// 在生产环境中，这些URL会被过滤掉
// 这样可以确保在生产环境中不会意外暴露开发环境的URL
const DEV_URLS = [
  'tauri://localhost',
  'http://tauri.localhost',
  'http://localhost:3000',
]

// 获取完整的源列表，包括开发URL
const getFullOrigins = (origins: string[]) => {
  // 合并现有源和开发URL，并去重
  const allOrigins = [...origins, ...DEV_URLS]
  const uniqueOrigins = [...new Set(allOrigins)]
  return uniqueOrigins
}

// 过滤基础URL(确保后续添加)
const filterBaseOriginsForUI = (origins: string[]) => {
  return origins.filter((origin: string) => !DEV_URLS.includes(origin.trim()))
}

interface ClashHeaderConfigingRef {
  open: () => void
  close: () => void
}

interface AllowOriginItem {
  key: number
  value: string
}

export const HeaderConfiguration = forwardRef<ClashHeaderConfigingRef>(
  (props, ref) => {
    const { t } = useTranslation()
    const { clash, mutateClash, patchClash } = useClash()
    const [open, setOpen] = useState(false)

    const lastKeyRef = useRef(0) // 用于生成唯一的key

    // CORS配置状态管理
    const [corsConfig, setCorsConfig] = useState<{
      allowPrivateNetwork: boolean
      allowOrigins: AllowOriginItem[]
    }>(() => {
      const cors = clash?.['external-controller-cors']
      const origins = cors?.['allow-origins'] ?? []
      return {
        allowPrivateNetwork: cors?.['allow-private-network'] ?? true,
        allowOrigins: filterBaseOriginsForUI(origins).map((origin) => {
          lastKeyRef.current += 1
          return { key: lastKeyRef.current, value: origin }
        }),
      }
    })

    // 处理CORS配置变更
    const handleCorsConfigChange = (
      key: 'allowPrivateNetwork' | 'allowOrigins',
      value: boolean | AllowOriginItem[],
    ) => {
      setCorsConfig((prev) => ({
        ...prev,
        [key]: value,
      }))
    }

    // 添加新的允许来源
    const handleAddOrigin = () => {
      lastKeyRef.current += 1
      handleCorsConfigChange('allowOrigins', [
        ...corsConfig.allowOrigins,
        { key: lastKeyRef.current, value: '' },
      ])
    }

    // 更新允许来源列表中的某一项
    const handleUpdateOrigin = (index: number, value: string) => {
      const newOrigins = [...corsConfig.allowOrigins]
      newOrigins[index] = { ...newOrigins[index], value }
      handleCorsConfigChange('allowOrigins', newOrigins)
    }

    // 删除允许来源列表中的某一项
    const handleDeleteOrigin = (index: number) => {
      const newOrigins = [...corsConfig.allowOrigins]
      newOrigins.splice(index, 1)
      handleCorsConfigChange('allowOrigins', newOrigins)
    }

    // 保存配置请求
    const { loading, run: saveConfig } = useRequest(
      async () => {
        // 保存时使用完整的源列表（包括开发URL）
        const fullOrigins = getFullOrigins(
          corsConfig.allowOrigins.map((origin) => origin.value),
        )

        await patchClash({
          'external-controller-cors': {
            'allow-private-network': corsConfig.allowPrivateNetwork,
            'allow-origins': fullOrigins.filter(
              (origin: string) => origin.trim() !== '',
            ),
          },
        })
        await restartCore()
        await mutateClash()
      },
      {
        manual: true,
        onSuccess: () => {
          setOpen(false)
          showNotice.success('shared.feedback.notifications.common.saveSuccess')
        },
        onError: () => {
          showNotice.error('shared.feedback.notifications.common.saveFailed')
        },
      },
    )

    useImperativeHandle(ref, () => ({
      open: () => {
        const cors = clash?.['external-controller-cors']
        const origins = cors?.['allow-origins'] ?? []
        lastKeyRef.current = 0
        setCorsConfig({
          allowPrivateNetwork: cors?.['allow-private-network'] ?? true,
          allowOrigins: filterBaseOriginsForUI(origins).map((origin) => {
            lastKeyRef.current += 1
            return { key: lastKeyRef.current, value: origin }
          }),
        })
        setOpen(true)
      },
      close: () => setOpen(false),
    }))

    const handleSave = useLockFn(async () => {
      await saveConfig()
    })

    return (
      <BaseDialog
        open={open}
        title={t('settings.sections.externalCors.title')}
        contentSx={{ width: 500 }}
        okBtn={loading ? t('shared.statuses.saving') : t('shared.actions.save')}
        cancelBtn={t('shared.actions.cancel')}
        onClose={() => setOpen(false)}
        onCancel={() => setOpen(false)}
        onOk={handleSave}
      >
        <div className="w-[90%] p-inset">
          <div className="py-component">
            <div className="flex w-full items-center justify-between">
              <span className="font-normal">
                {t('settings.sections.externalCors.fields.allowPrivateNetwork')}
              </span>
              <Switch
                checked={corsConfig.allowPrivateNetwork}
                onCheckedChange={(checked) =>
                  handleCorsConfigChange('allowPrivateNetwork', checked)
                }
              />
            </div>
          </div>

          <div className="my-inset border-t border-[var(--color-border)]" />

          <div className="py-component">
            <div className="w-full">
              <div className="mb-component font-bold">
                {t('settings.sections.externalCors.fields.allowedOrigins')}
              </div>
              {corsConfig.allowOrigins.map(({ key, value: origin }, index) => (
                <div
                  key={key}
                  className="mb-component flex items-center gap-component"
                >
                  <Input
                    className="text-body"
                    value={origin}
                    onChange={(e) => handleUpdateOrigin(index, e.target.value)}
                    placeholder={t(
                      'settings.sections.externalCors.placeholders.origin',
                    )}
                  />
                  <Button
                    variant="destructive"
                    size="icon-sm"
                    onClick={() => handleDeleteOrigin(index)}
                    disabled={corsConfig.allowOrigins.length <= 0}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                onClick={handleAddOrigin}
                className="bg-[var(--color-success)] text-white hover:bg-[var(--color-success)]/90"
              >
                {t('settings.sections.externalCors.actions.add')}
              </Button>

              <div className="mt-stack rounded-[var(--radius-container)] bg-[var(--color-bg-subtle)] p-component">
                <div className="text-caption italic text-[var(--color-text-muted)]">
                  {t('settings.sections.externalCors.messages.alwaysIncluded', {
                    urls: DEV_URLS.join(', '),
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </BaseDialog>
    )
  },
)
