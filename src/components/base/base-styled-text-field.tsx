import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type BaseStyledTextFieldProps = React.ComponentProps<'input'>

export const BaseStyledTextField = ({
  className,
  placeholder,
  ...props
}: BaseStyledTextFieldProps) => {
  const { t } = useTranslation()

  return (
    <Input
      autoComplete="new-password"
      spellCheck={false}
      placeholder={placeholder ?? t('shared.placeholders.filter')}
      className={cn(
        'rounded-[var(--radius-control)] border-[var(--color-border)] bg-[var(--color-bg-card)] px-component text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] dark:bg-[var(--color-bg-card)]',
        className,
      )}
      {...props}
    />
  )
}
