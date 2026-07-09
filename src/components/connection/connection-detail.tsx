import { Box, Button, Snackbar, Typography, useTheme } from '@mui/material'
import { useLockFn } from 'ahooks'
import dayjs from 'dayjs'
import {
  Fragment,
  useCallback,
  useImperativeHandle,
  useState,
  type Ref,
} from 'react'
import { useTranslation } from 'react-i18next'
import { closeConnection } from 'tauri-plugin-mihomo-api'

import parseTraffic from '@/utils/parse-traffic'

import { ConnectionRouteTimeline } from './connection-route'
import {
  formatConnectionChainPath,
  getConnectionChainPath,
} from './connection-route-utils'
import {
  getConnectionHost,
  getConnectionProcess,
  getConnectionRule,
  getConnectionSource,
  getConnectionTypeLabel,
} from './connection-row-view'

export interface ConnectionDetailRef {
  open: (detail: IConnectionsItem, closed: boolean) => void
  close: () => void
}

export function ConnectionDetail({ ref }: { ref?: Ref<ConnectionDetailRef> }) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<IConnectionsItem | null>(null)
  const [closed, setClosed] = useState(false)
  const theme = useTheme()

  const onClose = useCallback(() => {
    setOpen(false)
    setDetail(null)
    setClosed(false)
  }, [])

  useImperativeHandle(ref, () => ({
    open: (detail: IConnectionsItem, closed: boolean) => {
      if (open) return
      setOpen(true)
      setDetail(detail)
      setClosed(closed)
    },
    close: onClose,
  }))

  return (
    <Snackbar
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      open={open}
      onClose={onClose}
      sx={{
        '.MuiSnackbarContent-root': {
          boxSizing: 'border-box',
          width: { xs: 'calc(100vw - 32px)', sm: 720 },
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: '72vh',
          overflowY: 'auto',
          backgroundColor: theme.palette.background.paper,
          color: theme.palette.text.primary,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: '8px',
          boxShadow: theme.shadows[8],
          p: 0,
        },
        '.MuiSnackbarContent-message': {
          boxSizing: 'border-box',
          width: '100%',
          p: 0,
        },
      }}
      message={
        detail ? (
          <InnerConnectionDetail
            data={detail}
            closed={closed}
            onClose={onClose}
          />
        ) : null
      }
    />
  )
}

interface InnerProps {
  data: IConnectionsItem
  closed: boolean
  onClose?: () => void
}

const InnerConnectionDetail = ({ data, closed, onClose }: InnerProps) => {
  const { t } = useTranslation()
  const { metadata } = data
  const theme = useTheme()
  const chains = formatConnectionChainPath(data.chains)
  const chainPath = getConnectionChainPath(data.chains)
  const rule = getConnectionRule(data)
  const host = getConnectionHost(data)
  const destination = metadata.destinationIP || metadata.remoteDestination
  const process = getConnectionProcess(data)
  const processDetail =
    metadata.process && metadata.processPath
      ? `${metadata.process} (${metadata.processPath})`
      : process
  const policy = chainPath.length > 1 ? chainPath.slice(0, -1).join(' -> ') : ''
  const exitNode = chainPath[chainPath.length - 1] || ''

  const routeSteps = [
    { label: t('connections.components.route.app'), value: process },
    {
      label: t('connections.components.route.inbound'),
      value: getConnectionTypeLabel(data),
    },
    { label: t('connections.components.route.rule'), value: rule },
    { label: t('connections.components.route.policy'), value: policy },
    { label: t('connections.components.route.exit'), value: exitNode },
    { label: t('connections.components.route.remote'), value: host },
  ]

  const information = [
    {
      label: t('shared.labels.downloaded'),
      value: parseTraffic(data.download).join(' '),
    },
    {
      label: t('shared.labels.uploaded'),
      value: parseTraffic(data.upload).join(' '),
    },
    {
      label: t('connections.components.fields.dlSpeed'),
      value: parseTraffic(data.curDownload ?? -1).join(' ') + '/s',
    },
    {
      label: t('connections.components.fields.ulSpeed'),
      value: parseTraffic(data.curUpload ?? -1).join(' ') + '/s',
    },
    {
      label: t('connections.components.fields.process'),
      value: processDetail,
    },
    {
      label: t('connections.components.fields.time'),
      value: dayjs(data.start).fromNow(),
    },
    {
      label: t('connections.components.fields.source'),
      value: getConnectionSource(data),
    },
    {
      label: t('connections.components.fields.destination'),
      value: destination,
    },
    {
      label: t('connections.components.fields.destinationPort'),
      value: `${metadata.destinationPort}`,
    },
    {
      label: t('connections.components.fields.chains'),
      value: chains,
    },
  ].filter((item) => item.value)

  const onDelete = useLockFn(async () => closeConnection(data.id))

  return (
    <Box
      sx={{
        boxSizing: 'border-box',
        width: '100%',
        p: 2,
        userSelect: 'text',
        color: theme.palette.text.secondary,
      }}
    >
      <Typography
        component="div"
        sx={{
          mb: 1,
          color: theme.palette.text.primary,
          fontSize: 14,
          fontWeight: 700,
          lineHeight: 1.3,
        }}
      >
        {t('connections.components.route.title')}
      </Typography>
      <ConnectionRouteTimeline steps={routeSteps} />

      <Box
        sx={{
          mt: 1.5,
          pt: 1.5,
          borderTop: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Typography
          component="div"
          sx={{
            mb: 0.75,
            color: theme.palette.text.secondary,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {t('connections.components.route.details')}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'max-content minmax(0, 1fr)',
            columnGap: 1.5,
            rowGap: 0.5,
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {information.map((each) => (
            <Fragment key={each.label}>
              <Box
                component="span"
                sx={{ color: theme.palette.text.secondary, fontWeight: 700 }}
              >
                {each.label}
              </Box>
              <Box
                component="span"
                sx={{
                  minWidth: 0,
                  color: theme.palette.text.primary,
                  overflowWrap: 'anywhere',
                }}
              >
                {each.value}
              </Box>
            </Fragment>
          ))}
        </Box>
      </Box>

      {!closed && (
        <Box sx={{ mt: 2, textAlign: 'right' }}>
          <Button
            variant="contained"
            title={t('connections.components.actions.closeConnection')}
            onClick={() => {
              onDelete()
              onClose?.()
            }}
          >
            {t('connections.components.actions.closeConnection')}
          </Button>
        </Box>
      )}
    </Box>
  )
}
