import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'

import { BaseDialog } from '@/components/base'

interface Props {
  open: boolean
  value: string
  title?: string
  onClose: () => void
}

export const QrViewer = (props: Props) => {
  const { open, value, title, onClose } = props
  const { t } = useTranslation()

  return (
    <BaseDialog
      open={open}
      title={title ?? t('profiles.modals.qrViewer.title')}
      disableFooter
      contentSx={{ maxWidth: 360 }}
      onClose={onClose}
    >
      <div className="flex justify-center rounded-[var(--radius-compact)] bg-white p-inset">
        <QRCodeSVG value={value} size={256} level="M" />
      </div>
    </BaseDialog>
  )
}
