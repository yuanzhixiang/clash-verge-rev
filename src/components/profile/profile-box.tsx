import { alpha, Box, styled } from '@mui/material'

export const ProfileBox = styled(Box)(
  ({ theme, 'aria-selected': selected }) => {
    const { text } = theme.palette

    return {
      position: 'relative',
      display: 'block',
      width: '100%',
      minHeight: 64,
      cursor: 'pointer',
      textAlign: 'left',
      padding: '11px 14px',
      boxSizing: 'border-box',
      borderBottom: '1px solid var(--shell-border)',
      borderRadius: 0,
      backgroundColor: selected ? alpha(text.primary, 0.065) : 'transparent',
      color: text.secondary,
      transition: 'background-color 160ms ease',
      '&:hover': {
        backgroundColor: selected
          ? alpha(text.primary, 0.075)
          : alpha(text.primary, 0.04),
      },
      '&:focus-visible': {
        outline: '2px solid var(--shell-focus)',
        outlineOffset: -2,
      },
      '& h2': { color: text.primary },
    }
  },
)
