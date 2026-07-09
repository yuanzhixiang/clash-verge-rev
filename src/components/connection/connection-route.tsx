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
                px: 0.75,
                borderRadius: 1,
                border: '1px solid',
                borderColor: alpha(
                  theme.palette.primary.main,
                  isExit ? 0.45 : 0.24,
                ),
                color: isExit
                  ? theme.palette.primary.main
                  : theme.palette.text.primary,
                backgroundColor: alpha(
                  theme.palette.primary.main,
                  isExit ? 0.12 : 0.06,
                ),
                fontSize: 12,
                fontWeight: isExit ? 600 : 500,
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
                  color: theme.palette.text.disabled,
                  fontSize: 12,
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
        flexWrap: 'wrap',
        gap: 0.75,
        py: 0.25,
      }}
    >
      {visibleSteps.map((step) => {
        const isExit = step === visibleSteps[visibleSteps.length - 1]

        return (
          <Fragment key={step.label}>
            <Box
              title={`${step.label}: ${step.value}`}
              sx={{
                boxSizing: 'border-box',
                flex: '0 1 auto',
                minWidth: 108,
                maxWidth: 220,
                px: 1,
                py: 0.75,
                borderRadius: 1,
                border: '1px solid',
                borderColor: isExit
                  ? alpha(theme.palette.primary.main, 0.45)
                  : theme.palette.divider,
                backgroundColor: isExit
                  ? alpha(theme.palette.primary.main, 0.08)
                  : alpha(theme.palette.action.hover, 0.55),
              }}
            >
              <Typography
                component="div"
                sx={{
                  color: theme.palette.text.secondary,
                  fontSize: 10,
                  fontWeight: 600,
                  lineHeight: 1.25,
                }}
              >
                {step.label}
              </Typography>
              <Typography
                component="div"
                sx={{
                  color: isExit
                    ? theme.palette.primary.main
                    : theme.palette.text.primary,
                  fontSize: 12.5,
                  fontWeight: isExit ? 600 : 500,
                  lineHeight: 1.35,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.value}
              </Typography>
            </Box>
            {!isExit && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  color: theme.palette.text.disabled,
                  fontSize: 12,
                  px: 0.25,
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
