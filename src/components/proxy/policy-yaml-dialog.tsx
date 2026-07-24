import { useTheme } from 'next-themes'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, MonacoEditor } from '@/components/base'
import type { ProfileFormat } from '@/services/profile-format'

interface Props {
  open: boolean
  title: string
  initialText: string
  saving: boolean
  format: ProfileFormat
  onCancel: () => void
  onSave: (text: string) => void
}

/**
 * 节点/组的 YAML 片段编辑弹窗（编辑与新建共用）。
 * 只负责文本编辑，解析校验与写回由调用方完成；保存失败时弹窗保持打开。
 * 调用方需在切换编辑目标时更换 key，使内部文本状态随之重置。
 */
export const PolicyYamlDialog = ({
  open,
  title,
  initialText,
  saving,
  format,
  onCancel,
  onSave,
}: Props) => {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const [text, setText] = useState(initialText)

  return (
    <BaseDialog
      open={open}
      title={title}
      okBtn={t('shared.actions.save')}
      cancelBtn={t('shared.actions.cancel')}
      loading={saving}
      contentSx={{
        width: { xs: 320, sm: 520 },
        height: 380,
        pb: 1,
        userSelect: 'text',
      }}
      onCancel={onCancel}
      onClose={onCancel}
      onOk={() => onSave(text)}
    >
      <MonacoEditor
        height="100%"
        language={format === 'conf' ? 'surge-conf' : 'yaml'}
        value={text}
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
        onChange={(value) => setText(value ?? '')}
        options={{
          tabSize: 2,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 13,
          lineNumbers: 'off',
          folding: false,
          wordWrap: 'on',
        }}
      />
    </BaseDialog>
  )
}
