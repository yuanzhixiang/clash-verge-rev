import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

type ProfileBoxProps = Omit<ComponentProps<'div'>, 'aria-selected'> & {
  'aria-selected'?: boolean
}

export const ProfileBox = ({
  className,
  'aria-selected': selected,
  ...props
}: ProfileBoxProps) => {
  return (
    <div
      aria-selected={selected}
      className={cn(
        'relative box-border block min-h-16 w-full cursor-pointer px-[14px] py-[11px] text-left',
        'border-b border-[var(--color-border)] text-[var(--color-text-secondary)]',
        'transition-colors duration-[var(--duration-base)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]',
        '[&_h2]:text-[var(--color-text-primary)]',
        selected
          ? 'bg-[color-mix(in_srgb,var(--color-text-primary)_6.5%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-text-primary)_7.5%,transparent)]'
          : 'hover:bg-[color-mix(in_srgb,var(--color-text-primary)_4%,transparent)]',
        className,
      )}
      {...props}
    />
  )
}
