import { alpha, Box, styled, Typography } from '@mui/material'

import type { RuntimeRule } from '@/types/rule'

const Item = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'var(--rules-grid-columns)',
  alignItems: 'center',
  boxSizing: 'border-box',
  width: '100%',
  height: 32,
  color: theme.palette.text.primary,
  borderBottom: '1px solid var(--shell-border)',
  cursor: 'default',
  outline: 'none',
  transition: 'background-color 120ms ease',
  '&[data-striped="true"]': {
    backgroundColor: alpha(theme.palette.text.primary, 0.025),
  },
  '&:hover': {
    backgroundColor: alpha(theme.palette.text.primary, 0.065),
  },
  '&[data-selected="true"]': {
    backgroundColor: alpha(theme.palette.text.primary, 0.11),
  },
  '&:focus-visible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: -2,
  },
}))

const Cell = styled(Typography)({
  minWidth: 0,
  padding: '0 8px',
  overflow: 'hidden',
  fontSize: 13,
  lineHeight: '32px',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  userSelect: 'text',
})

const POLICY_COLORS = [
  'primary.main',
  'secondary.main',
  'info.main',
  'warning.main',
  'success.main',
]

interface Props {
  value: RuntimeRule
  displayIndex: number
  selected: boolean
  onSelect: (value: RuntimeRule) => void
}

const parseColor = (text: string) => {
  if (text === 'REJECT' || text === 'REJECT-DROP') return 'error.main'
  if (text === 'DIRECT') return 'text.primary'

  let sum = 0
  for (let i = 0; i < text.length; i++) {
    sum += text.charCodeAt(i)
  }
  return POLICY_COLORS[sum % POLICY_COLORS.length]
}

const RuleItem = ({ value, displayIndex, selected, onSelect }: Props) => {
  const payload = value.payload || '-'
  const used = value.extra?.hitCount
  const usedLabel = used == null ? '—' : String(used)

  return (
    <Item
      role="row"
      tabIndex={0}
      aria-selected={selected}
      data-selected={selected ? 'true' : 'false'}
      data-striped={displayIndex % 2 === 1 ? 'true' : 'false'}
      onClick={() => onSelect(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(value)
        }
      }}
    >
      <Cell
        role="cell"
        color="text.secondary"
        title={String(value.index)}
        sx={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
      >
        {value.index}
      </Cell>
      <Cell role="cell" title={value.type} sx={{ fontWeight: 560 }}>
        {value.type}
      </Cell>
      <Cell role="cell" title={payload}>
        {payload}
      </Cell>
      <Cell role="cell" title={value.proxy} color={parseColor(value.proxy)}>
        {value.proxy}
      </Cell>
      <Cell
        role="cell"
        title={usedLabel}
        color="text.secondary"
        sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
      >
        {usedLabel}
      </Cell>
    </Item>
  )
}

export default RuleItem
