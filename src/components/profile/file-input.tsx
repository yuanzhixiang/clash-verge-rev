import { useLockFn } from 'ahooks'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

interface Props {
  onChange: (file: File, value: string) => void
}

export const FileInput = (props: Props) => {
  const { onChange } = props

  const { t } = useTranslation()
  // file input
  const inputRef = useRef<any>(undefined)
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')

  const onFileInput = useLockFn(async (e: any) => {
    const file = e.target.files?.[0] as File

    if (!file) return

    setFileName(file.name)
    setLoading(true)

    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        resolve(null)
        onChange(file, event.target?.result as string)
      }
      reader.onerror = reject
      reader.readAsText(file)
    }).finally(() => setLoading(false))
  })

  return (
    <div className="mt-inset mb-component flex items-center">
      <Button
        variant="outline"
        className="flex-none"
        onClick={() => inputRef.current?.click()}
      >
        {t('profiles.components.fileInput.chooseFile')}
      </Button>

      <input
        type="file"
        accept=".yaml,.yml"
        ref={inputRef}
        className="hidden"
        onChange={onFileInput}
      />

      <p className="ml-component min-w-0 truncate">
        {loading ? 'Loading...' : fileName}
      </p>
    </div>
  )
}
