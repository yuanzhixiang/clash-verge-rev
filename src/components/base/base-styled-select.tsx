import * as React from 'react'

import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface BaseStyledSelectProps {
  value?: string
  defaultValue?: string
  /** Radix-native change handler. */
  onValueChange?: (value: string) => void
  /** Back-compat shim: mimics the MUI `onChange` event shape. */
  onChange?: (event: { target: { value: string } }) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  children?: React.ReactNode
}

export const BaseStyledSelect = ({
  value,
  defaultValue,
  onValueChange,
  onChange,
  disabled,
  placeholder,
  className,
  children,
}: BaseStyledSelectProps) => {
  return (
    <Select
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      onValueChange={(v) => {
        onValueChange?.(v)
        onChange?.({ target: { value: v } })
      }}
    >
      <SelectTrigger
        className={cn(
          'mr-component h-[33px] w-[120px] rounded-[var(--radius-control)] border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] data-[placeholder]:text-[var(--color-text-muted)] dark:bg-[var(--color-bg-card)]',
          className,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  )
}
