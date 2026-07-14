import { SpeedRounded } from '@mui/icons-material'
import { Box, ButtonBase, Typography, alpha } from '@mui/material'

import { BaseLoading } from '@/components/base'
import { useProxyDelayState } from '@/hooks/use-proxy-delay-state'
import delayManager from '@/services/delay'

const cardSx = {
  position: 'relative',
  display: 'flex',
  minWidth: 0,
  minHeight: 92,
  flexDirection: 'column',
  alignItems: 'stretch',
  justifyContent: 'space-between',
  overflow: 'hidden',
  borderRadius: 'var(--radius-container)',
  bgcolor: 'var(--shell-panel-muted)',
  px: 1.5,
  py: 1.25,
  textAlign: 'left',
  transition: 'background-color 160ms ease, transform 160ms ease',
  '&:hover': {
    bgcolor: 'var(--shell-nav-hover)',
    transform: 'translateY(-1px)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--shell-focus) !important',
    outlineOffset: 2,
  },
} as const

const groupCardSx = {
  position: 'relative',
  display: 'flex',
  width: '100%',
  minWidth: 0,
  minHeight: 92,
  flexDirection: 'column',
  alignItems: 'stretch',
  justifyContent: 'space-between',
  overflow: 'hidden',
  borderRadius: 'var(--radius-container)',
  bgcolor: 'var(--shell-panel-muted)',
  px: 1.5,
  py: 1.25,
  textAlign: 'left',
  transition: 'background-color 160ms ease, transform 160ms ease',
  '&:hover': {
    bgcolor: 'var(--shell-nav-hover)',
    transform: 'translateY(-1px)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--shell-focus) !important',
    outlineOffset: 2,
  },
} as const

interface DelayLabelProps {
  proxy: IProxyItem
  groupName: string
  testLabel: string
}

export const PolicyDelayLabel = ({
  proxy,
  groupName,
  testLabel,
}: DelayLabelProps) => {
  const { delayValue, isPreset, timeout, onDelay } = useProxyDelayState(
    proxy,
    groupName,
  )

  if (isPreset) return null

  return (
    <ButtonBase
      onClick={(event) => {
        event.stopPropagation()
        void onDelay(proxy.provider)
      }}
      aria-label={`${testLabel}: ${proxy.name}`}
      title={`${testLabel}: ${proxy.name}`}
      sx={{
        minWidth: 0,
        minHeight: 24,
        justifyContent: 'flex-start',
        borderRadius: 'var(--radius-compact)',
        color:
          delayValue >= 0
            ? delayManager.formatDelayColor(delayValue, timeout)
            : 'text.secondary',
        fontSize: 12,
        lineHeight: 1.2,
        '&:hover': { color: 'primary.main' },
      }}
    >
      {delayValue === -2 ? (
        <BaseLoading />
      ) : delayValue >= 0 ? (
        delayManager.formatDelay(delayValue, timeout)
      ) : (
        <>
          <SpeedRounded sx={{ mr: 0.5, fontSize: 15 }} />
          {testLabel}
        </>
      )}
    </ButtonBase>
  )
}

interface ProxyCardProps {
  proxy: IProxyItem
  testLabel: string
}

export const PolicyProxyCard = ({ proxy, testLabel }: ProxyCardProps) => {
  const { delayValue, timeout, onDelay } = useProxyDelayState(
    proxy,
    'policy-standalone',
  )

  return (
    <ButtonBase
      onClick={() => void onDelay(proxy.provider)}
      aria-label={`${testLabel}: ${proxy.name}`}
      title={`${testLabel}: ${proxy.name}`}
      sx={cardSx}
    >
      <Box sx={{ width: '100%', minWidth: 0 }}>
        <Typography
          noWrap
          title={proxy.type}
          sx={({ palette }) => ({
            mb: 0.5,
            color: alpha(
              palette.text.primary,
              palette.mode === 'dark' ? 0.47 : 0.32,
            ),
            fontSize: 11.5,
            lineHeight: 1.25,
          })}
        >
          {proxy.type}
        </Typography>
        <Typography
          noWrap
          title={proxy.name}
          sx={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}
        >
          {proxy.name}
        </Typography>
      </Box>
      <Box
        sx={{
          display: 'flex',
          width: '100%',
          minWidth: 0,
          minHeight: 24,
          alignItems: 'center',
        }}
      >
        {delayValue === -2 ? (
          <BaseLoading />
        ) : (
          <Typography
            noWrap
            sx={({ palette }) => ({
              color:
                delayValue >= 0
                  ? delayManager.formatDelayColor(delayValue, timeout)
                  : alpha(
                      palette.text.primary,
                      palette.mode === 'dark' ? 0.47 : 0.32,
                    ),
              fontSize: 12,
              fontWeight: 500,
              lineHeight: 1.3,
            })}
          >
            {delayValue >= 0
              ? delayManager.formatDelay(delayValue, timeout)
              : testLabel}
          </Typography>
        )}
      </Box>
    </ButtonBase>
  )
}

interface GroupCardProps {
  group: IProxyGroupItem
  open: boolean
  readonly: boolean
  onClick: (event: React.MouseEvent<HTMLElement>) => void
}

export const PolicyGroupCard = ({
  group,
  open,
  readonly,
  onClick,
}: GroupCardProps) => (
  <ButtonBase
    onClick={onClick}
    aria-haspopup="dialog"
    aria-expanded={open}
    sx={[groupCardSx, open && { bgcolor: 'var(--shell-nav-selected)' }]}
  >
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography
          noWrap
          title={group.type}
          sx={({ palette }) => ({
            minWidth: 0,
            color: alpha(
              palette.text.primary,
              palette.mode === 'dark' ? 0.47 : 0.32,
            ),
            fontSize: 11.5,
            lineHeight: 1.25,
          })}
        >
          {group.type}
        </Typography>
        {readonly && (
          <Typography
            component="span"
            sx={({ palette }) => ({
              color: alpha(
                palette.text.primary,
                palette.mode === 'dark' ? 0.47 : 0.32,
              ),
              fontSize: 10.5,
              lineHeight: 1.2,
            })}
          >
            · Auto
          </Typography>
        )}
      </Box>
      <Typography
        noWrap
        title={group.name}
        sx={{ mt: 0.5, fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}
      >
        {group.name}
      </Typography>
    </Box>

    <Box sx={{ display: 'flex', minWidth: 0, alignItems: 'center' }}>
      <Typography
        noWrap
        title={group.now}
        sx={({ palette }) => ({
          minWidth: 0,
          color: alpha(
            palette.text.primary,
            palette.mode === 'dark' ? 0.47 : 0.32,
          ),
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.3,
        })}
      >
        {group.now || '—'}
      </Typography>
    </Box>
  </ButtonBase>
)
