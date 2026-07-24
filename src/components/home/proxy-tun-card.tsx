import { CircleHelp, Monitor, ScanSearch, type LucideIcon } from 'lucide-react'
import { useState, useMemo, memo, FC } from 'react'
import { useTranslation } from 'react-i18next'

import ProxyControlSwitches from '@/components/shared/proxy-control-switches'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useSystemProxyState } from '@/hooks/use-system-proxy-state'
import { useSystemState } from '@/hooks/use-system-state'
import { useVerge } from '@/hooks/use-verge'
import { cn } from '@/lib/utils'
import { showNotice } from '@/services/notice-service'

const LOCAL_STORAGE_TAB_KEY = 'clash-verge-proxy-active-tab'

interface TabButtonProps {
  isActive: boolean
  onClick: () => void
  icon: LucideIcon
  label: string
  hasIndicator?: boolean
}

// Tab组件
const TabButton: FC<TabButtonProps> = memo(
  ({ isActive, onClick, icon: Icon, label, hasIndicator = false }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex max-w-40 flex-1 cursor-pointer items-center justify-center gap-component rounded-[var(--radius-container)] px-inset py-component transition-all duration-[var(--duration-base)] hover:-translate-y-px',
        isActive
          ? "bg-[var(--color-accent)] text-[var(--color-text-on-accent)] shadow-[var(--shadow-card)] after:absolute after:-bottom-2.5 after:left-1/2 after:h-2.5 after:w-0.5 after:-translate-x-1/2 after:bg-[var(--color-accent)] after:content-['']"
          : 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] hover:shadow-[var(--shadow-card)]',
      )}
    >
      <Icon className="size-5" />
      <span
        className={cn('text-body', isActive ? 'font-semibold' : 'font-normal')}
      >
        {label}
      </span>
      {hasIndicator && (
        <span
          className={cn(
            'absolute top-component right-component size-2 rounded-full',
            isActive
              ? 'bg-[var(--color-text-on-accent)]'
              : 'bg-[var(--color-success)]',
          )}
        />
      )}
    </button>
  ),
)

interface TabDescriptionProps {
  description: string
  tooltipTitle: string
}

// 描述文本组件
const TabDescription: FC<TabDescriptionProps> = memo(
  ({ description, tooltipTitle }) => (
    <p className="flex w-[95%] animate-in items-center justify-center gap-inline rounded-[var(--radius-compact)] border border-[var(--color-accent)] bg-[var(--color-bg-card)] p-compact text-center text-caption break-words text-[var(--color-text-secondary)] duration-200 fade-in hyphens-auto">
      {description}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <CircleHelp className="size-3.5 shrink-0 opacity-70" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltipTitle}</TooltipContent>
      </Tooltip>
    </p>
  ),
)

export const ProxyTunCard: FC = () => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<string>(
    () => localStorage.getItem(LOCAL_STORAGE_TAB_KEY) || 'system',
  )

  const { verge } = useVerge()
  const { isTunModeAvailable } = useSystemState()
  const { configState: systemProxyConfigState } = useSystemProxyState()

  const { enable_tun_mode } = verge ?? {}

  const handleError = (err: unknown) => {
    showNotice.error(err)
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    localStorage.setItem(LOCAL_STORAGE_TAB_KEY, tab)
  }

  const tabDescription = useMemo(() => {
    if (activeTab === 'system') {
      return {
        text: systemProxyConfigState
          ? t('home.components.proxyTun.status.systemProxyEnabled')
          : t('home.components.proxyTun.status.systemProxyDisabled'),
        tooltip: t('home.components.proxyTun.tooltips.systemProxy'),
      }
    } else {
      return {
        text: !isTunModeAvailable
          ? t('home.components.proxyTun.status.tunModeServiceRequired')
          : enable_tun_mode
            ? t('home.components.proxyTun.status.tunModeEnabled')
            : t('home.components.proxyTun.status.tunModeDisabled'),
        tooltip: t('home.components.proxyTun.tooltips.tunMode'),
      }
    }
  }, [
    activeTab,
    systemProxyConfigState,
    enable_tun_mode,
    isTunModeAvailable,
    t,
  ])

  return (
    <div className="flex w-full flex-col">
      <div className="relative z-[2] flex justify-center gap-component">
        <TabButton
          isActive={activeTab === 'system'}
          onClick={() => handleTabChange('system')}
          icon={Monitor}
          label={t('settings.sections.system.toggles.systemProxy')}
          hasIndicator={systemProxyConfigState}
        />
        <TabButton
          isActive={activeTab === 'tun'}
          onClick={() => handleTabChange('tun')}
          icon={ScanSearch}
          label={t('settings.sections.system.toggles.tunMode')}
          hasIndicator={enable_tun_mode && isTunModeAvailable}
        />
      </div>

      <div className="relative my-component flex w-full justify-center overflow-visible">
        <TabDescription
          description={tabDescription.text}
          tooltipTitle={tabDescription.tooltip}
        />
      </div>

      <div className="mt-0 rounded-[var(--radius-container)] bg-[color-mix(in_srgb,var(--color-accent)_4%,transparent)] p-component">
        <ProxyControlSwitches
          onError={handleError}
          label={
            activeTab === 'system'
              ? t('settings.sections.system.toggles.systemProxy')
              : t('settings.sections.system.toggles.tunMode')
          }
          noRightPadding={true}
        />
      </div>
    </div>
  )
}
