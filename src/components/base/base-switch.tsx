import * as React from 'react'

import { Switch as UISwitch } from '@/components/ui/switch'

export interface SwitchProps {
  checked?: boolean
  defaultChecked?: boolean
  disabled?: boolean
  className?: string
  id?: string
  name?: string
  /** shadcn/Radix style change handler */
  onCheckedChange?: (checked: boolean) => void
  /**
   * Legacy MUI-compatible change handler: `(event, checked) => void`.
   * `event` is a minimal synthetic object exposing `target.checked` so that
   * both `(e) => e.target.checked` and `(_, checked) => checked` keep working.
   */
  onChange?: (event: any, checked: boolean) => void
  onBlur?: (event: any) => void
  /**
   * Passed through by consumers such as react-hook-form's `field.value`.
   * Ignored for rendering (use `checked`), only declared for compatibility.
   */
  value?: any
  // ---- Legacy MUI props: accepted for backward compatibility ----
  /** MUI-only, ignored. */
  edge?: 'start' | 'end' | false
  /** MUI-only, ignored. */
  color?: string
  /** MUI `small`/`medium` mapped onto the shadcn `sm`/`default` sizes. */
  size?: 'small' | 'medium' | 'sm' | 'default'
  /** MUI-only, ignored. */
  sx?: any
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  function Switch(
    {
      checked,
      defaultChecked,
      disabled,
      className,
      id,
      name,
      onCheckedChange,
      onChange,
      onBlur,
      value,
      size,
      // MUI-only props accepted but intentionally ignored
      edge,
      color,
      sx,
      ...rest
    },
    _ref,
  ) {
    // `value`/`edge`/`color`/`sx` are destructured purely to keep them out of
    // `rest` so they are not forwarded onto the underlying DOM element.
    void value
    void edge
    void color
    void sx

    const uiSize: 'sm' | 'default' =
      size === 'small' || size === 'sm' ? 'sm' : 'default'

    return (
      <UISwitch
        id={id}
        name={name}
        className={className}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onBlur={onBlur}
        size={uiSize}
        onCheckedChange={(v) => {
          onCheckedChange?.(v)
          onChange?.({ target: { checked: v } }, v)
        }}
        {...rest}
      />
    )
  },
)
