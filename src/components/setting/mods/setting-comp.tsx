import { ChevronRight, Loader2 } from 'lucide-react'
import React, { ReactNode, useState } from 'react'

import { cn } from '@/lib/utils'
import isAsyncFunction from '@/utils/is-async-function'

interface ItemProps {
  label: ReactNode
  extra?: ReactNode
  children?: ReactNode
  secondary?: ReactNode
  onClick?: () => void | Promise<any>
}

export const SettingItem: React.FC<ItemProps> = ({
  label,
  extra,
  children,
  secondary,
  onClick,
}) => {
  const clickable = !!onClick

  const primary = (
    <div className="flex items-center text-body">
      <span>{label}</span>
      {extra ? extra : null}
    </div>
  )

  const [isLoading, setIsLoading] = useState(false)
  const handleClick = () => {
    if (onClick) {
      if (isAsyncFunction(onClick)) {
        setIsLoading(true)
        onClick()!.finally(() => setIsLoading(false))
      } else {
        onClick()
      }
    }
  }

  const textBlock = (
    <div className="min-w-0 flex-1">
      {primary}
      {secondary ? (
        <div className="text-body text-[var(--color-text-secondary)]">
          {secondary}
        </div>
      ) : null}
    </div>
  )

  return clickable ? (
    <li className="p-0">
      <div
        role="button"
        tabIndex={isLoading ? -1 : 0}
        aria-disabled={isLoading}
        onClick={isLoading ? undefined : handleClick}
        onKeyDown={(e) => {
          if (isLoading) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleClick()
          }
        }}
        className={cn(
          'flex w-full items-center gap-component rounded-[var(--radius-control)] px-inset py-component transition-colors',
          isLoading
            ? 'pointer-events-none opacity-60'
            : 'cursor-pointer hover:bg-[var(--color-bg-hover)]',
        )}
      >
        {textBlock}
        {isLoading ? (
          <Loader2 className="size-5 animate-spin text-[var(--color-text-secondary)]" />
        ) : (
          <ChevronRight className="size-5 text-[var(--color-text-secondary)]" />
        )}
      </div>
    </li>
  ) : (
    <li className="flex items-center gap-component px-inset py-[5px]">
      {textBlock}
      {children}
    </li>
  )
}

export const SettingList: React.FC<{
  title: string
  children: ReactNode
}> = ({ title, children }) => (
  <ul>
    <li className="px-inset py-component text-h3 font-bold text-[var(--color-text-primary)]">
      {title}
    </li>

    {children}
  </ul>
)
