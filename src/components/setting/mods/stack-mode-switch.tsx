import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  value?: string
  onChange?: (value: string) => void
}

const MODES = [
  { key: 'system', label: 'System' },
  { key: 'gvisor', label: 'gVisor' },
  { key: 'mixed', label: 'Mixed' },
] as const

export const StackModeSwitch = (props: Props) => {
  const { value, onChange } = props

  return (
    <div className="my-inline inline-flex">
      {MODES.map((mode, index) => (
        <Button
          key={mode.key}
          type="button"
          size="sm"
          variant={value?.toLowerCase() === mode.key ? 'default' : 'outline'}
          onClick={() => onChange?.(mode.key)}
          className={cn(
            'rounded-none capitalize',
            index === 0 && 'rounded-l-[var(--radius-control)]',
            index === MODES.length - 1 && 'rounded-r-[var(--radius-control)]',
            index > 0 && '-ml-px',
          )}
        >
          {mode.label}
        </Button>
      ))}
    </div>
  )
}
