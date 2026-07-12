import {
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  useMediaQuery,
} from '@mui/material'
import type { ReactNode } from 'react'
import { useCallback } from 'react'
import { useMatch, useNavigate, useResolvedPath } from 'react-router'

import { useVerge } from '@/hooks/use-verge'

interface Props {
  to: string
  children: string
  icon: ReactNode[]
  onPreload?: () => Promise<unknown>
}
export const LayoutItem = (props: Props) => {
  const { to, children, icon, onPreload } = props
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

  const handlePreload = useCallback(() => {
    void onPreload?.().catch(() => {})
  }, [onPreload])

  return (
    <ListItem sx={{ width: '100%', maxWidth: 250, mx: 'auto', px: 0, py: 0.2 }}>
      <ListItemButton
        selected={!!match}
        sx={[
          {
            minHeight: 42,
            borderRadius: 1.75,
            px: 1.5,
            py: 0.5,
            cursor: 'pointer',
            transition:
              'background-color 160ms ease, color 160ms ease, transform 160ms ease',
            '&:active': {
              bgcolor: 'var(--shell-nav-selected)',
            },
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
              fontWeight: 450,
              letterSpacing: '-0.005em',
            },
            '&.Mui-selected': {
              bgcolor: 'var(--shell-nav-selected)',
            },
            '&.Mui-selected:hover': {
              bgcolor: 'var(--shell-nav-selected)',
            },
          },
        ]}
        title={compact ? children : undefined}
        aria-label={children}
        onFocus={handlePreload}
        onMouseEnter={handlePreload}
        onPointerDown={handlePreload}
        onClick={() => navigate(to)}
      >
        {(effectiveMenuIcon === 'monochrome' || !effectiveMenuIcon) && (
          <ListItemIcon
            sx={{
              color: 'text.secondary',
              minWidth: 36,
              cursor: 'inherit',
              transition: 'color 160ms ease',
              '& .MuiSvgIcon-root': { fontSize: 20 },
            }}
          >
            {icon[0]}
          </ListItemIcon>
        )}
        {effectiveMenuIcon === 'colorful' && (
          <ListItemIcon
            sx={{
              minWidth: 36,
              cursor: 'inherit',
              opacity: 0.72,
              transition: 'opacity 160ms ease',
              '& .MuiSvgIcon-root': { fontSize: 20 },
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
