import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { Copy, Loader2 } from 'lucide-react'
import type { Ref } from 'react'
import { useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, BaseEmpty, DialogRef } from '@/components/base'
import { Button } from '@/components/ui/button'
import { useNetworkInterfaces } from '@/hooks/use-network'
import { showNotice } from '@/services/notice-service'

export function NetworkInterfaceViewer({ ref }: { ref?: Ref<DialogRef> }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [isV4, setIsV4] = useState(true)

  useImperativeHandle(ref, () => ({
    open: () => {
      setOpen(true)
    },
    close: () => setOpen(false),
  }))

  const { networkInterfaces, loading } = useNetworkInterfaces()
  const isEmpty = networkInterfaces.length === 0
  const getAddressIp = (address: IAddress) =>
    isV4 ? address.V4?.ip : address.V6?.ip

  return (
    <BaseDialog
      open={open}
      title={
        <div className="flex items-center justify-between">
          {t('settings.modals.networkInterface.title')}
          <div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setIsV4((prev) => !prev)
              }}
            >
              {isV4 ? 'Ipv6' : 'Ipv4'}
            </Button>
          </div>
        </div>
      }
      contentSx={{ width: 450 }}
      disableOk
      cancelBtn={t('shared.actions.close')}
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    >
      {loading && isEmpty ? (
        <div className="flex justify-center py-section-sm">
          <Loader2 className="size-6 animate-spin text-[var(--color-text-secondary)]" />
        </div>
      ) : isEmpty ? (
        <div className="min-h-[160px]">
          <BaseEmpty />
        </div>
      ) : (
        networkInterfaces.map((item) => (
          <div key={item.name}>
            <h4>{item.name}</h4>
            <div>
              {item.addr.map((address) => {
                const ip = getAddressIp(address)
                return (
                  ip && (
                    <AddressDisplay
                      key={ip}
                      label={t(
                        'settings.modals.networkInterface.fields.ipAddress',
                      )}
                      content={ip}
                    />
                  )
                )
              })}
              <AddressDisplay
                label={t('settings.modals.networkInterface.fields.macAddress')}
                content={item.mac_addr ?? ''}
              />
            </div>
          </div>
        ))
      )}
    </BaseDialog>
  )
}

const AddressDisplay = ({
  label,
  content,
}: {
  label: string
  content: string
}) => {
  return (
    <div className="my-component flex items-center justify-between">
      <div>{label}</div>
      <div className="flex items-center rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] py-adjust pr-adjust pl-component">
        <span className="select-text">{content}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={async () => {
            await writeText(content)
            showNotice.success(
              'shared.feedback.notifications.common.copySuccess',
            )
          }}
        >
          <Copy className="size-[18px]" />
        </Button>
      </div>
    </div>
  )
}
