import { Info } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface TooltipIconProps {
  title?: string
  /**
   * 兼容旧用法：既可传 lucide/MUI 图标组件（组件类型），也可传已实例化的元素。
   */
  icon?: React.ComponentType<any> | React.ReactElement
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  className?: string
  /** 以下为旧 MUI IconButton 遗留 props，接受但忽略，避免消费方编译报错。 */
  color?: any
  size?: any
  sx?: any
  [key: string]: any
}

export const TooltipIcon: React.FC<TooltipIconProps> = (props) => {
  const {
    title = '',
    icon = Info,
    onClick,
    className,
    // 丢弃旧 MUI 专有 props，避免透传到 DOM
    color: _color,
    size: _size,
    sx: _sx,
    ...restProps
  } = props

  const iconNode = React.isValidElement(icon)
    ? icon
    : React.createElement(icon as React.ComponentType<any>)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClick}
          className={cn(
            'cursor-pointer text-[var(--color-text-secondary)]',
            className,
          )}
          {...restProps}
        >
          {iconNode}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{title}</TooltipContent>
    </Tooltip>
  )
}
