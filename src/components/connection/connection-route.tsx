import { Box, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import { Fragment, type ReactNode } from 'react'

import { getConnectionChainPath } from './connection-route-utils'

export interface ConnectionRouteStep {
  label: string
  value?: string | null
}

export const ConnectionRouteChips = ({
  chains,
  empty,
}: {
  chains: string[]
  empty?: ReactNode
}) => {
  const theme = useTheme()
  const path = getConnectionChainPath(chains)
  const keyedPath = path.map((node, index) => ({
    node,
    key: path.slice(0, index + 1).join(' -> '),
  }))

  if (!path.length) return empty

  return (
    <Box
      title={path.join(' -> ')}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        minWidth: 0,
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    >
      {keyedPath.map(({ node, key }) => {
        const isExit = key === keyedPath[keyedPath.length - 1].key

        return (
          <Fragment key={key}>
            <Box
              component="span"
              sx={{
                boxSizing: 'border-box',
                flex: '0 1 auto',
                minWidth: 0,
                maxWidth: isExit ? 160 : 140,
                height: 22,
                px: 0.9,
                borderRadius: 'var(--radius-compact)',
                border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
                color: theme.palette.primary.main,
                backgroundColor: alpha(
                  theme.palette.primary.main,
                  isExit ? 0.13 : 0.08,
                ),
                fontSize: 12,
                fontWeight: 600,
                lineHeight: '20px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {node}
            </Box>
            {!isExit && (
              <Box
                component="span"
                sx={{
                  flex: '0 0 auto',
                  color: alpha(theme.palette.text.primary, 0.55),
                  fontSize: 15,
                  lineHeight: 1,
                }}
              >
                -&gt;
              </Box>
            )}
          </Fragment>
        )
      })}
    </Box>
  )
}

export const ConnectionRouteTimeline = ({
  steps,
}: {
  steps: ConnectionRouteStep[]
}) => {
  const theme = useTheme()
  const visibleSteps = steps.filter((step) => step.value)

  if (!visibleSteps.length) return null

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'stretch',
        flexWrap: 'nowrap',
        gap: 1,
        py: 0.25,
        overflowX: 'auto',
        overflowY: 'hidden',
      }}
    >
      {visibleSteps.map((step) => {
        const isRemote = step === visibleSteps[visibleSteps.length - 1]

        return (
          <Fragment key={step.label}>
            <Box
              title={`${step.label}: ${step.value}`}
              sx={{
                boxSizing: 'border-box',
                flex: '0 1 auto',
                minWidth: 120,
                maxWidth: 250,
                px: 1.25,
                py: 0.8,
                borderRadius: 'var(--radius-compact)',
                border: '1px solid',
                borderColor: alpha(theme.palette.primary.main, 0.26),
                backgroundColor: alpha(theme.palette.primary.main, 0.035),
              }}
            >
              <Typography
                component="div"
                sx={{
                  color: theme.palette.primary.main,
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: 1.25,
                }}
              >
                {step.label}
              </Typography>
              <Typography
                component="div"
                sx={{
                  color: isRemote
                    ? theme.palette.primary.main
                    : theme.palette.text.primary,
                  fontSize: 12.5,
                  fontWeight: isRemote ? 600 : 500,
                  lineHeight: 1.35,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.value}
              </Typography>
            </Box>
            {!isRemote && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  color: alpha(theme.palette.text.primary, 0.6),
                  fontSize: 20,
                  px: 0.1,
                }}
              >
                -&gt;
              </Box>
            )}
          </Fragment>
        )
      })}
    </Box>
  )
}
