import { useLockFn } from 'ahooks'
import {
  CircleHelp,
  Gauge,
  Router,
  ScrollText,
  Server,
  Settings,
} from 'lucide-react'
import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, BasePage } from '@/components/base'
import { ClashModeCard } from '@/components/home/clash-mode-card'
import { CurrentProxyCard } from '@/components/home/current-proxy-card'
import { EnhancedCard } from '@/components/home/enhanced-card'
import { EnhancedTrafficStats } from '@/components/home/enhanced-traffic-stats'
import { HomeProfileCard } from '@/components/home/home-profile-card'
import { ProxyTunCard } from '@/components/home/proxy-tun-card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useProfiles } from '@/hooks/use-profiles'
import { useVerge } from '@/hooks/use-verge'
import { entry_lightweight_mode, openWebUrl } from '@/services/cmds'

const LazyTestCard = lazy(() =>
  import('@/components/home/test-card').then((module) => ({
    default: module.TestCard,
  })),
)
const LazyIpInfoCard = lazy(() =>
  import('@/components/home/ip-info-card').then((module) => ({
    default: module.IpInfoCard,
  })),
)
const LazyClashInfoCard = lazy(() =>
  import('@/components/home/clash-info-card').then((module) => ({
    default: module.ClashInfoCard,
  })),
)
const LazySystemInfoCard = lazy(() =>
  import('@/components/home/system-info-card').then((module) => ({
    default: module.SystemInfoCard,
  })),
)

const cardFallback = (
  <Skeleton className="h-[200px] w-full rounded-[var(--radius-card)]" />
)

// 定义首页卡片设置接口
interface HomeCardsSettings {
  profile: boolean
  proxy: boolean
  network: boolean
  mode: boolean
  traffic: boolean
  info: boolean
  clashinfo: boolean
  systeminfo: boolean
  test: boolean
  ip: boolean
  [key: string]: boolean
}

// 首页设置对话框组件接口
interface HomeSettingsDialogProps {
  open: boolean
  onClose: () => void
  homeCards: HomeCardsSettings
  onSave: (cards: HomeCardsSettings) => void
}

// 设置弹窗的卡片开关项（key + i18n 文案），顺序即展示顺序
const CARD_OPTIONS: { key: string; label: string }[] = [
  { key: 'profile', label: 'home.page.settings.cards.profile' },
  { key: 'proxy', label: 'home.page.settings.cards.currentProxy' },
  { key: 'network', label: 'home.page.settings.cards.network' },
  { key: 'mode', label: 'home.page.settings.cards.proxyMode' },
  { key: 'traffic', label: 'home.page.settings.cards.traffic' },
  { key: 'test', label: 'home.page.settings.cards.tests' },
  { key: 'ip', label: 'home.page.settings.cards.ip' },
  { key: 'clashinfo', label: 'home.page.settings.cards.clashInfo' },
  { key: 'systeminfo', label: 'home.page.settings.cards.systemInfo' },
]

const serializeCardFlags = (cards: HomeCardsSettings) =>
  Object.keys(cards)
    .sort()
    .map((key) => `${key}:${cards[key] ? 1 : 0}`)
    .join('|')

// 首页设置对话框组件
const HomeSettingsDialog = ({
  open,
  onClose,
  homeCards,
  onSave,
}: HomeSettingsDialogProps) => {
  const { t } = useTranslation()
  const [cards, setCards] = useState<HomeCardsSettings>(homeCards)
  const { patchVerge } = useVerge()

  const handleToggle = (key: string) => {
    setCards((prev: HomeCardsSettings) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleSave = async () => {
    await patchVerge({ home_cards: cards })
    onSave(cards)
    onClose()
  }

  return (
    <BaseDialog
      open={open}
      title={t('home.page.settings.title')}
      contentSx={{ maxWidth: 444 }}
      okBtn={t('shared.actions.save')}
      cancelBtn={t('shared.actions.cancel')}
      onOk={handleSave}
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="flex flex-col gap-compact">
        {CARD_OPTIONS.map(({ key, label }) => (
          <label
            key={key}
            className="flex cursor-pointer select-none items-center gap-component py-inline"
          >
            <Checkbox
              checked={cards[key] || false}
              onCheckedChange={() => handleToggle(key)}
            />
            <span className="text-body text-[var(--color-text-primary)]">
              {t(label)}
            </span>
          </label>
        ))}
      </div>
    </BaseDialog>
  )
}

const HomePage = () => {
  const { t } = useTranslation()
  const { verge } = useVerge()
  const { current, mutateProfiles } = useProfiles()

  // 设置弹窗的状态
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [localHomeCards, setLocalHomeCards] = useState<{
    value: HomeCardsSettings
    baseSignature: string
  } | null>(null)

  // 卡片显示状态
  const defaultCards = useMemo<HomeCardsSettings>(
    () => ({
      info: false,
      profile: true,
      proxy: true,
      network: true,
      mode: true,
      traffic: true,
      clashinfo: true,
      systeminfo: true,
      test: true,
      ip: true,
    }),
    [],
  )

  const vergeHomeCards = useMemo<HomeCardsSettings | null>(
    () => (verge?.home_cards as HomeCardsSettings | undefined) ?? null,
    [verge],
  )

  const remoteHomeCards = useMemo<HomeCardsSettings>(
    () => vergeHomeCards ?? defaultCards,
    [defaultCards, vergeHomeCards],
  )

  const remoteSignature = useMemo(
    () => serializeCardFlags(remoteHomeCards),
    [remoteHomeCards],
  )

  const pendingLocalCards = useMemo<HomeCardsSettings | null>(() => {
    if (!localHomeCards) return null
    return localHomeCards.baseSignature === remoteSignature
      ? localHomeCards.value
      : null
  }, [localHomeCards, remoteSignature])

  const effectiveHomeCards = pendingLocalCards ?? remoteHomeCards

  // 文档链接函数
  const toGithubDoc = useLockFn(() => {
    return openWebUrl('https://clash-verge-rev.github.io/index.html')
  })

  // 新增：打开设置弹窗
  const openSettings = useCallback(() => {
    setSettingsOpen(true)
  }, [])

  const renderCard = useCallback(
    (cardKey: string, component: React.ReactNode, size: number = 6) => {
      if (!effectiveHomeCards[cardKey]) return null

      return (
        <div
          className={size === 12 ? 'col-span-6 md:col-span-12' : 'col-span-6'}
          key={cardKey}
        >
          {component}
        </div>
      )
    },
    [effectiveHomeCards],
  )

  const criticalCards = useMemo(
    () => [
      renderCard(
        'profile',
        <HomeProfileCard current={current} onProfileUpdated={mutateProfiles} />,
      ),
      renderCard('proxy', <CurrentProxyCard />),
      renderCard('network', <NetworkSettingsCard />),
      renderCard('mode', <ClashModeEnhancedCard />),
    ],
    [current, mutateProfiles, renderCard],
  )

  // 新增：保存设置时用requestIdleCallback/setTimeout
  const handleSaveSettings = (newCards: HomeCardsSettings) => {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(() =>
        setLocalHomeCards({
          value: newCards,
          baseSignature: remoteSignature,
        }),
      )
    } else {
      setTimeout(
        () =>
          setLocalHomeCards({
            value: newCards,
            baseSignature: remoteSignature,
          }),
        0,
      )
    }
  }

  const nonCriticalCards = useMemo(
    () => [
      renderCard(
        'traffic',
        <EnhancedCard
          title={t('home.page.cards.trafficStats')}
          icon={<Gauge />}
          iconColor="secondary"
        >
          <EnhancedTrafficStats />
        </EnhancedCard>,
        12,
      ),
      renderCard(
        'test',
        <Suspense fallback={cardFallback}>
          <LazyTestCard />
        </Suspense>,
      ),
      renderCard(
        'ip',
        <Suspense fallback={cardFallback}>
          <LazyIpInfoCard />
        </Suspense>,
      ),
      renderCard(
        'clashinfo',
        <Suspense fallback={cardFallback}>
          <LazyClashInfoCard />
        </Suspense>,
      ),
      renderCard(
        'systeminfo',
        <Suspense fallback={cardFallback}>
          <LazySystemInfoCard />
        </Suspense>,
      ),
    ],
    [t, renderCard],
  )
  const dialogKey = useMemo(
    () => `${serializeCardFlags(effectiveHomeCards)}:${settingsOpen ? 1 : 0}`,
    [effectiveHomeCards, settingsOpen],
  )
  return (
    <BasePage
      title={t('home.page.title')}
      contentStyle={{ padding: 2 }}
      header={
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={async () => await entry_lightweight_mode()}
              >
                <ScrollText />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t('home.page.tooltips.lightweightMode')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={toGithubDoc}>
                <CircleHelp />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('home.page.tooltips.manual')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={openSettings}>
                <Settings />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('home.page.tooltips.settings')}</TooltipContent>
          </Tooltip>
        </div>
      }
    >
      <div className="grid grid-cols-6 gap-stack md:grid-cols-12">
        {criticalCards}

        {nonCriticalCards}
      </div>

      {/* 首页设置弹窗 */}
      <HomeSettingsDialog
        key={dialogKey}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        homeCards={effectiveHomeCards}
        onSave={handleSaveSettings}
      />
    </BasePage>
  )
}

// 增强版网络设置卡片组件
const NetworkSettingsCard = () => {
  const { t } = useTranslation()
  return (
    <EnhancedCard
      title={t('home.page.cards.networkSettings')}
      icon={<Server />}
      iconColor="primary"
      action={null}
    >
      <ProxyTunCard />
    </EnhancedCard>
  )
}

// 增强版 Clash 模式卡片组件
const ClashModeEnhancedCard = () => {
  const { t } = useTranslation()
  return (
    <EnhancedCard
      title={t('home.page.cards.proxyMode')}
      icon={<Router />}
      iconColor="info"
      action={null}
    >
      <ClashModeCard />
    </EnhancedCard>
  )
}

export default HomePage
