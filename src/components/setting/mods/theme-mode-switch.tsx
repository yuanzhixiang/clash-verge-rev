import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ThemeValue = IVergeConfig['theme_mode']

interface Props {
  value?: ThemeValue
  onChange?: (value: ThemeValue) => void
}

export const ThemeModeSwitch = (props: Props) => {
  const { value, onChange } = props
  const { t } = useTranslation()

  const modes = ['light', 'dark', 'system'] as const

  return (
    <div className="my-inline inline-flex">
      {modes.map((mode, index) => (
        <Button
          key={mode}
          type="button"
          size="sm"
          variant={mode === value ? 'default' : 'outline'}
          onClick={() => onChange?.(mode)}
          className={cn(
            'rounded-none capitalize',
            index === 0 && 'rounded-l-[var(--radius-control)]',
            index === modes.length - 1 && 'rounded-r-[var(--radius-control)]',
            index > 0 && '-ml-px',
          )}
        >
          {t(`settings.sections.appearance.${mode}`)}
        </Button>
      ))}
    </div>
  )
}
