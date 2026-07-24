import { ChevronUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  onClick: () => void
  show: boolean
  ariaLabel?: string
  className?: string
}

export const ScrollTopButton = ({
  onClick,
  show,
  ariaLabel,
  className,
}: Props) => {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'absolute bottom-inset right-inset rounded-full',
        'bg-[color-mix(in_srgb,var(--color-text-primary)_10%,transparent)]',
        'hover:bg-[color-mix(in_srgb,var(--color-text-primary)_20%,transparent)]',
        'transition-opacity duration-[var(--duration-base)]',
        show
          ? 'visible opacity-100'
          : 'pointer-events-none invisible opacity-0',
        className,
      )}
    >
      <ChevronUp />
    </Button>
  )
}
