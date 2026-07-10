import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core'
import {
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  useMediaQuery,
} from '@mui/material'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import { useCallback } from 'react'
import { useMatch, useNavigate, useResolvedPath } from 'react-router'

import { useVerge } from '@/hooks/use-verge'

interface SortableProps {
  setNodeRef?: (element: HTMLElement | null) => void
  attributes?: DraggableAttributes
  listeners?: DraggableSyntheticListeners
  style?: CSSProperties
  isDragging?: boolean
  disabled?: boolean
}

interface Props {
  to: string
  children: string
  icon: ReactNode[]
  sortable?: SortableProps
  onPreload?: () => Promise<unknown>
}
export const LayoutItem = (props: Props) => {
  const { to, children, icon, sortable, onPreload } = props
  const { verge } = useVerge()
  const { menu_icon } = verge ?? {}
  const navCollapsed = verge?.collapse_navbar ?? false
  const compactByViewport = useMediaQuery('(max-width:720px)')
  const compact = navCollapsed || compactByViewport
  const resolved = useResolvedPath(to)
  const match = useMatch({ path: resolved.pathname, end: true })
  const navigate = useNavigate()

  const effectiveMenuIcon =
    compact && menu_icon === 'disable' ? 'monochrome' : menu_icon

  const { setNodeRef, attributes, listeners, style, isDragging, disabled } =
    sortable ?? {}

  const draggable = Boolean(sortable) && !disabled
  const { onPointerDown, ...otherListeners } = draggable
    ? (listeners ?? {})
    : {}

  const handlePreload = useCallback(() => {
    void onPreload?.().catch(() => {})
  }, [onPreload])

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      handlePreload()
      onPointerDown?.(event)
    },
    [handlePreload, onPointerDown],
  )

  return (
    <ListItem
      ref={setNodeRef}
      style={style}
      sx={[
        {
          width: '100%',
          maxWidth: 250,
          mx: 'auto',
          px: 0.75,
          py: 0.25,
        },
        isDragging ? { opacity: 0.78 } : {},
      ]}
    >
      <ListItemButton
        selected={!!match}
        {...(draggable ? (attributes ?? {}) : {})}
        {...(draggable ? otherListeners : {})}
        sx={[
          {
            minHeight: 42,
            borderRadius: 1.5,
            px: 1.25,
            py: 0.5,
            cursor: draggable ? 'grab' : 'pointer',
            transition:
              'background-color 160ms ease, color 160ms ease, transform 160ms ease',
            '&:active': draggable ? { cursor: 'grabbing' } : {},
            '&:hover': {
              bgcolor: 'var(--shell-nav-hover)',
            },
            '&:focus-visible': {
              outline: '2px solid var(--shell-focus) !important',
              outlineOffset: '-2px',
            },
            '& .MuiListItemText-primary': {
              color: 'text.primary',
              fontSize: 14,
              fontWeight: 550,
              letterSpacing: '-0.01em',
            },
          },
          ({ palette }) => {
            const color = palette.text.primary
            return {
              '&.Mui-selected': {
                bgcolor: 'var(--shell-nav-selected)',
                color,
              },
              '&.Mui-selected:hover': {
                bgcolor: 'var(--shell-nav-selected)',
              },
              '&.Mui-selected .MuiListItemText-primary': {
                color,
                fontWeight: 680,
              },
            }
          },
        ]}
        title={compact ? children : undefined}
        aria-label={children}
        onFocus={handlePreload}
        onMouseEnter={handlePreload}
        onPointerDown={handlePointerDown}
        onClick={() => navigate(to)}
      >
        {(effectiveMenuIcon === 'monochrome' || !effectiveMenuIcon) && (
          <ListItemIcon
            sx={{
              color: 'text.primary',
              minWidth: 38,
              cursor: draggable ? 'grab' : 'inherit',
              '& .MuiSvgIcon-root': { fontSize: 21 },
            }}
          >
            {icon[0]}
          </ListItemIcon>
        )}
        {effectiveMenuIcon === 'colorful' && (
          <ListItemIcon
            sx={{
              minWidth: 38,
              cursor: draggable ? 'grab' : 'inherit',
              '& .MuiSvgIcon-root': { fontSize: 21 },
            }}
          >
            {icon[1]}
          </ListItemIcon>
        )}
        <ListItemText
          sx={{
            minWidth: 0,
            m: 0,
            textAlign: 'left',
            pl: effectiveMenuIcon === 'disable' ? 1 : 0,
          }}
          primary={children}
        />
      </ListItemButton>
    </ListItem>
  )
}
