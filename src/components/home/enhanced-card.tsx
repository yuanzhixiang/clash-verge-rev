import { Box, Typography, alpha, useTheme } from '@mui/material'
import React, { forwardRef, ReactNode } from 'react'

// 自定义卡片组件接口
interface EnhancedCardProps {
  title: ReactNode
  icon: ReactNode
  action?: ReactNode
  children: ReactNode
  iconColor?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success'
  minHeight?: number | string
  noContentPadding?: boolean
}

// 自定义卡片组件
export const EnhancedCard = forwardRef<HTMLElement, EnhancedCardProps>(
  (
    {
      title,
      icon,
      action,
      children,
      iconColor = 'primary',
      minHeight,
      noContentPadding = false,
    },
    ref,
  ) => {
    const theme = useTheme()
    // 统一的标题截断样式
    const titleTruncateStyle = {
      minWidth: 0,
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      display: 'block',
    }

    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--shell-border)',
          borderRadius: 'var(--radius-container)',
          backgroundColor: 'var(--shell-card)',
          boxShadow:
            theme.palette.mode === 'dark'
              ? '0 10px 28px rgba(0, 0, 0, 0.16)'
              : '0 10px 28px rgba(63, 78, 96, 0.07)',
          transition:
            'border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
          '@media (hover: hover)': {
            '&:hover': {
              borderColor: 'var(--shell-border-strong)',
              transform: 'translateY(-1px)',
              boxShadow:
                theme.palette.mode === 'dark'
                  ? '0 14px 32px rgba(0, 0, 0, 0.2)'
                  : '0 14px 32px rgba(63, 78, 96, 0.1)',
            },
          },
        }}
        ref={ref}
      >
        <Box
          sx={{
            px: 2.25,
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              minWidth: 0,
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-control)',
                width: 36,
                height: 36,
                mr: 1.5,
                flexShrink: 0,
                backgroundColor: alpha(theme.palette[iconColor].main, 0.12),
                color: theme.palette[iconColor].main,
              }}
            >
              {icon}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              {typeof title === 'string' ? (
                <Typography
                  variant="h6"
                  sx={{
                    ...titleTruncateStyle,
                    fontWeight: 600,
                    fontSize: 16,
                    letterSpacing: '-0.015em',
                  }}
                  title={title}
                >
                  {title}
                </Typography>
              ) : (
                <Box sx={titleTruncateStyle}>{title}</Box>
              )}
            </Box>
          </Box>
          {action && <Box sx={{ ml: 2, flexShrink: 0 }}>{action}</Box>}
        </Box>
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            p: noContentPadding ? 0 : 2.25,
            ...(minHeight && { minHeight }),
          }}
        >
          {children}
        </Box>
      </Box>
    )
  },
)
