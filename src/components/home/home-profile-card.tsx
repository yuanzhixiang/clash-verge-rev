import { useLockFn } from 'ahooks'
import dayjs from 'dayjs'
import {
  Calendar,
  CloudUpload,
  Database,
  ExternalLink,
  Gauge,
  RefreshCw,
  Server,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useAppRefreshers } from '@/providers/app-data-context'
import { openWebUrl, updateProfile } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import parseTraffic from '@/utils/parse-traffic'

import { EnhancedCard } from './enhanced-card'

// 辅助函数解析URL和过期时间
const parseUrl = (url?: string) => {
  if (!url) return '-'
  if (url.startsWith('http')) return new URL(url).host
  return 'local'
}

const parseExpire = (expire?: number) => {
  if (!expire) return '-'
  return dayjs(expire * 1000).format('YYYY-MM-DD')
}

// 使用类型定义，而不是导入
interface ProfileExtra {
  upload: number
  download: number
  total: number
  expire: number
}

interface ProfileItem {
  uid: string
  type?: 'local' | 'remote' | 'merge' | 'script'
  name?: string
  desc?: string
  file?: string
  url?: string
  updated?: number
  extra?: ProfileExtra
  home?: string
  option?: any
}

interface HomeProfileCardProps {
  current: ProfileItem | null | undefined
  onProfileUpdated?: () => void
}

// 提取独立组件减少主组件复杂度
const ProfileDetails = ({
  current,
  onUpdateProfile,
  updating,
}: {
  current: ProfileItem
  onUpdateProfile: () => void
  updating: boolean
}) => {
  const { t } = useTranslation()

  const usedTraffic = useMemo(() => {
    if (!current.extra) return 0
    return current.extra.upload + current.extra.download
  }, [current.extra])

  const trafficPercentage = useMemo(() => {
    if (!current.extra || !current.extra.total || current.extra.total <= 0)
      return 0
    return Math.min(Math.round((usedTraffic / current.extra.total) * 100), 100)
  }, [current.extra, usedTraffic])

  return (
    <div>
      <div className="flex flex-col gap-inset">
        {current.url && (
          <div className="flex items-center gap-component">
            <Server className="size-5 shrink-0 text-[var(--color-text-secondary)]" />
            <div className="flex min-w-0 items-center overflow-hidden text-body text-[var(--color-text-secondary)] whitespace-nowrap">
              <span className="shrink-0">{t('shared.labels.from')}: </span>
              {current.home ? (
                <button
                  type="button"
                  onClick={() => current.home && openWebUrl(current.home)}
                  className="ml-inline inline-flex min-w-0 max-w-[calc(100%-40px)] items-center font-medium text-[var(--color-accent)] hover:underline"
                  title={parseUrl(current.url)}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {parseUrl(current.url)}
                  </span>
                  <ExternalLink className="ml-inline size-3 shrink-0 opacity-70" />
                </button>
              ) : (
                <span
                  className="ml-inline min-w-0 flex-1 truncate font-medium"
                  title={parseUrl(current.url)}
                >
                  {parseUrl(current.url)}
                </span>
              )}
            </div>
          </div>
        )}

        {current.updated && (
          <div className="flex items-center gap-component">
            <RefreshCw
              className={cn(
                'size-5 shrink-0 cursor-pointer text-[var(--color-text-secondary)]',
                updating && 'animate-[spin_1.5s_linear_infinite]',
              )}
              onClick={onUpdateProfile}
            />
            <p
              className="cursor-pointer text-body text-[var(--color-text-secondary)]"
              onClick={onUpdateProfile}
            >
              {t('shared.labels.updateTime')}:{' '}
              <span className="font-medium">
                {dayjs(current.updated * 1000).format('YYYY-MM-DD HH:mm')}
              </span>
            </p>
          </div>
        )}

        {current.extra && (
          <>
            <div className="flex items-center gap-component">
              <Gauge className="size-5 shrink-0 text-[var(--color-text-secondary)]" />
              <p className="text-body text-[var(--color-text-secondary)]">
                {t('shared.labels.usedTotal')}:{' '}
                <span className="font-medium">
                  {parseTraffic(usedTraffic)} /{' '}
                  {parseTraffic(current.extra.total)}
                </span>
              </p>
            </div>

            {current.extra.expire > 0 && (
              <div className="flex items-center gap-component">
                <Calendar className="size-5 shrink-0 text-[var(--color-text-secondary)]" />
                <p className="text-body text-[var(--color-text-secondary)]">
                  {t('shared.labels.expireTime')}:{' '}
                  <span className="font-medium">
                    {parseExpire(current.extra.expire)}
                  </span>
                </p>
              </div>
            )}

            <div className="mt-component">
              <span className="mb-inline block text-caption text-[var(--color-text-secondary)]">
                {trafficPercentage}%
              </span>
              <Progress
                value={trafficPercentage}
                className="h-2 rounded-[var(--radius-compact)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// 提取空配置组件
const EmptyProfile = ({ onClick }: { onClick: () => void }) => {
  const { t } = useTranslation()

  return (
    <div
      className="flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-container)] py-5 hover:bg-[var(--color-bg-hover)]"
      onClick={onClick}
    >
      <CloudUpload className="mb-inset size-15 text-[var(--color-accent)]" />
      <h3 className="mb-component text-h2 font-medium">
        {t('profiles.page.actions.import')} {t('profiles.page.title')}
      </h3>
      <p className="text-body text-[var(--color-text-secondary)]">
        {t('profiles.components.card.labels.clickToImport')}
      </p>
    </div>
  )
}

export const HomeProfileCard = ({
  current,
  onProfileUpdated,
}: HomeProfileCardProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { refreshAll } = useAppRefreshers()

  // 更新当前订阅
  const [updating, setUpdating] = useState(false)

  const onUpdateProfile = useLockFn(async () => {
    if (!current?.uid) return

    setUpdating(true)
    try {
      await updateProfile(current.uid, current.option)
      onProfileUpdated?.()

      // 刷新首页数据
      refreshAll()
    } catch (err) {
      showNotice.error(err, 3000)
    } finally {
      setUpdating(false)
    }
  })

  // 导航到订阅页面
  const goToProfiles = useCallback(() => {
    navigate('/profile')
  }, [navigate])

  // 卡片标题
  const cardTitle = useMemo(() => {
    if (!current) return t('profiles.page.title')

    if (!current.home) return current.name

    return (
      <button
        type="button"
        onClick={() => current.home && openWebUrl(current.home)}
        className="flex min-w-0 max-w-full items-center text-lg font-medium text-inherit [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate"
        title={current.name}
      >
        <span>{current.name}</span>
        <ExternalLink className="ml-inline size-3 shrink-0 opacity-70" />
      </button>
    )
  }, [current, t])

  // 卡片操作按钮
  const cardAction = useMemo(() => {
    if (!current) return null

    return (
      <Button
        variant="outline"
        size="sm"
        onClick={goToProfiles}
        className="rounded-[var(--radius-control)]"
      >
        {t('layout.components.navigation.tabs.profiles')}
        <Database className="size-4" />
      </Button>
    )
  }, [current, goToProfiles, t])

  return (
    <EnhancedCard
      title={cardTitle}
      icon={<CloudUpload className="size-5" />}
      iconColor="info"
      action={cardAction}
    >
      {current ? (
        <ProfileDetails
          current={current}
          onUpdateProfile={onUpdateProfile}
          updating={updating}
        />
      ) : (
        <EmptyProfile onClick={goToProfiles} />
      )}
    </EnhancedCard>
  )
}
