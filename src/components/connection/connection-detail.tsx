import { KeyboardArrowDownRounded } from '@mui/icons-material'
import { Box, Button, IconButton, Typography, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
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

export function ConnectionDetail({
  ref,
  onClose: onClosed,
}: {
  ref?: Ref<ConnectionDetailRef>
  onClose?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<IConnectionsItem | null>(null)
  const [closed, setClosed] = useState(false)

  const onClose = useCallback(() => {
    setOpen(false)
    setDetail(null)
    setClosed(false)
    onClosed?.()
  }, [onClosed])

  useImperativeHandle(ref, () => ({
    open: (detail: IConnectionsItem, closed: boolean) => {
      setOpen(true)
      setDetail(detail)
      setClosed(closed)
    },
    close: onClose,
  }))

  if (!open || !detail) return null

  return (
    <Box
      sx={{
        position: 'absolute',
        left: { xs: 8, sm: 12 },
        right: { xs: 8, sm: 12 },
        bottom: { xs: 8, sm: 10 },
        zIndex: 5,
      }}
    >
      <InnerConnectionDetail data={detail} closed={closed} onClose={onClose} />
    </Box>
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
  const trafficWithBytes = (value?: number) => {
    const bytes = value ?? 0
    return `${parseTraffic(bytes).join(' ')} (${bytes.toLocaleString()} bytes)`
  }

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

  const leftInformation = [
    {
      label: t('connections.components.fields.source'),
      value: getConnectionSource(data),
    },
    {
      label: t('shared.labels.downloaded'),
      value: trafficWithBytes(data.download),
    },
    {
      label: t('shared.labels.uploaded'),
      value: trafficWithBytes(data.upload),
    },
    {
      label: t('connections.components.fields.dlSpeed'),
      value: `${parseTraffic(data.curDownload ?? 0).join(' ')}/s`,
    },
    {
      label: t('connections.components.fields.ulSpeed'),
      value: `${parseTraffic(data.curUpload ?? 0).join(' ')}/s`,
    },
  ].filter((item) => item.value)

  const rightInformation = [
    {
      label: t('connections.components.fields.destination'),
      value: destination || '',
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
      label: t('connections.components.fields.destinationPort'),
      value: `${metadata.destinationPort}`,
    },
    {
      label: t('connections.components.fields.chains'),
      value: chains,
    },
  ].filter((item) => item.value)

  const onDelete = useLockFn(async () => closeConnection(data.id))
  const detailColumn = (items: typeof leftInformation) => (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(128px, max-content) minmax(0, 1fr)',
        columnGap: 2,
        rowGap: 1,
        minWidth: 0,
      }}
    >
      {items.map((each) => (
        <Fragment key={each.label}>
          <Box
            component="span"
            sx={{
              color: theme.palette.text.secondary,
              fontSize: 12.5,
              fontWeight: 700,
              lineHeight: 1.35,
            }}
          >
            {each.label}
          </Box>
          <Box
            component="span"
            sx={{
              minWidth: 0,
              color: theme.palette.text.primary,
              fontSize: 13,
              lineHeight: 1.35,
              overflowWrap: 'anywhere',
            }}
          >
            {each.value}
          </Box>
        </Fragment>
      ))}
    </Box>
  )

  return (
    <Box
      sx={{
        boxSizing: 'border-box',
        width: '100%',
        maxHeight: '48vh',
        overflow: 'auto',
        p: { xs: 1.5, sm: 2 },
        userSelect: 'text',
        color: theme.palette.text.primary,
        backgroundColor: alpha(theme.palette.background.paper, 0.98),
        border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
        borderRadius: 'var(--radius-container)',
        boxShadow: theme.shadows[6],
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          mb: 1.5,
          minWidth: 0,
        }}
      >
        <Typography
          component="div"
          title={host}
          sx={{
            minWidth: 0,
            color: theme.palette.text.primary,
            fontSize: 15,
            fontWeight: 700,
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {host}
        </Typography>
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            flex: '0 0 auto',
            color: theme.palette.text.secondary,
            fontSize: 12.5,
          }}
        >
          <Box
            component="span"
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: closed
                ? theme.palette.text.disabled
                : theme.palette.success.main,
            }}
          />
          {closed ? 'Closed' : 'Live'}
        </Box>
        <Box
          component="span"
          sx={{
            flex: '0 0 auto',
            color: theme.palette.text.secondary,
            fontSize: 12.5,
          }}
        >
          {dayjs(data.start).fromNow()}
        </Box>
        <Box
          component="span"
          sx={{
            flex: '0 0 auto',
            color: theme.palette.text.secondary,
            fontSize: 12.5,
          }}
        >
          Type: {getConnectionTypeLabel(data)}
        </Box>
        <Box sx={{ flex: 1 }} />
        {!closed && (
          <Button
            size="small"
            variant="outlined"
            title={t('connections.components.actions.closeConnection')}
            onClick={() => {
              onDelete()
              onClose?.()
            }}
            sx={{ flex: '0 0 auto', height: 30 }}
          >
            {t('connections.components.actions.closeConnection')}
          </Button>
        )}
        <IconButton
          size="small"
          aria-label="Close detail"
          onClick={onClose}
          sx={{ flex: '0 0 auto' }}
        >
          <KeyboardArrowDownRounded fontSize="small" />
        </IconButton>
      </Box>
      <Typography
        component="div"
        sx={{
          mb: 1,
          color: theme.palette.text.primary,
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1.3,
        }}
      >
        {t('connections.components.route.title')}
      </Typography>
      <ConnectionRouteTimeline steps={routeSteps} />

      <Box
        sx={{
          mt: 2,
          pt: 1.25,
          borderTop: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: { xs: 1, md: 3 },
          }}
        >
          {detailColumn(leftInformation)}
          {detailColumn(rightInformation)}
        </Box>
      </Box>
    </Box>
  )
}
