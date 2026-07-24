import { forwardRef, useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DialogRef } from '@/components/base'
import { EditorViewer } from '@/components/profile/editor-viewer'
import { Badge } from '@/components/ui/badge'
import { getRuntimeYaml } from '@/services/cmds'

export const ConfigViewer = forwardRef<DialogRef>((_, ref) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [runtimeConfig, setRuntimeConfig] = useState('')

  useImperativeHandle(ref, () => ({
    open: () => {
      setRuntimeConfig('')
      setLoading(true)
      setOpen(true)
      getRuntimeYaml()
        .then((data) => {
          setRuntimeConfig(data ?? '# Error getting runtime yaml\n')
        })
        .catch(() => {
          setRuntimeConfig('# Error getting runtime yaml\n')
        })
        .finally(() => {
          setLoading(false)
        })
    },
    close: () => setOpen(false),
  }))

  if (!open) return null
  return (
    <EditorViewer
      open={true}
      title={
        <div className="flex items-center gap-inset">
          {t('settings.components.verge.advanced.fields.runtimeConfig')}
          <Badge variant="secondary">{t('shared.labels.readOnly')}</Badge>
        </div>
      }
      value={runtimeConfig}
      readOnly
      language="yaml"
      path="runtime-config.yaml"
      loading={loading}
      onClose={() => setOpen(false)}
    />
  )
})
