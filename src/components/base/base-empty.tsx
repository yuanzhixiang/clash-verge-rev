import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { TranslationKey } from '@/types/generated/i18n-keys'

interface Props {
  text?: ReactNode
  textKey?: TranslationKey
  extra?: ReactNode
}

export const BaseEmpty = ({
  text,
  textKey = 'shared.statuses.empty',
  extra,
}: Props) => {
  const { t } = useTranslation()

  const resolvedText: ReactNode = text !== undefined ? text : t(textKey)

  return (
    <div className="flex size-full flex-col items-center justify-center text-[color:var(--color-text-muted)]">
      <Inbox className="size-16" strokeWidth={1.5} />
      <p className="text-body-lg">{resolvedText}</p>
      {extra}
    </div>
  )
}
