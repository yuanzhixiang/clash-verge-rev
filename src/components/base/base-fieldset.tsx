import type { ReactNode } from 'react'

type Props = {
  label: string
  fontSize?: string
  width?: string
  padding?: string
  children?: ReactNode
}

export const BaseFieldset: React.FC<Props> = ({
  label,
  fontSize,
  width,
  padding,
  children,
}: Props) => {
  const fieldsetPadding = padding ?? '15px'

  return (
    <fieldset
      className="relative rounded-[var(--radius-compact)] border border-[var(--color-border-strong)]"
      style={{ width: width ?? 'auto', padding: fieldsetPadding }}
    >
      <legend
        className="absolute -top-2.5 bg-[var(--color-bg-page)] px-inline text-[var(--color-text-primary)]"
        style={{ left: fieldsetPadding, fontSize: fontSize ?? '1em' }}
      >
        {label}
      </legend>
      {children}
    </fieldset>
  )
}
