import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, BaseEmpty } from '@/components/base'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  logInfo: [string, string][]
  onClose: () => void
}

export const LogViewer = (props: Props) => {
  const { open, logInfo, onClose } = props

  const { t } = useTranslation()

  return (
    <BaseDialog
      open={open}
      title={t('profiles.modals.logViewer.title')}
      disableOk
      cancelBtn={t('shared.actions.close')}
      contentSx={{ width: 400 }}
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="h-[300px] overflow-x-hidden overflow-y-auto pb-component select-text">
        {logInfo.map(([level, log]) => {
          const isError = level === 'error' || level === 'exception'
          return (
            <Fragment key={`${level}-${log}`}>
              <div className="text-[var(--color-text-secondary)]">
                <Badge
                  variant="outline"
                  className={cn(
                    'mr-component align-middle',
                    isError &&
                      'border-[var(--color-danger)] text-[var(--color-danger)]',
                  )}
                >
                  {level}
                </Badge>
                {log}
              </div>
              <Separator className="my-inline" />
            </Fragment>
          )
        })}

        {logInfo.length === 0 && <BaseEmpty />}
      </div>
    </BaseDialog>
  )
}
