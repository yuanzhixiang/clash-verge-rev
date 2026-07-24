import { Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { parseHotkey } from '@/utils/parse-hotkey'

interface Props {
  value: string[]
  onChange: (value: string[]) => void
}

export const HotkeyInput = (props: Props) => {
  const { value, onChange } = props
  const { t } = useTranslation()

  const changeRef = useRef<string[]>([])
  const [keys, setKeys] = useState(value)

  return (
    <div className="flex items-center">
      <div className="relative min-h-9 w-[230px]">
        <input
          className="peer absolute top-0 left-0 z-[1] size-full opacity-0"
          onKeyUp={() => {
            const ret = changeRef.current.slice()
            if (ret.length) {
              onChange(ret)
              changeRef.current = []
            }
          }}
          onKeyDown={(e) => {
            e.preventDefault()
            e.stopPropagation()

            const key = parseHotkey(e)
            if (key === 'UNIDENTIFIED') return

            changeRef.current = [...new Set([...changeRef.current, key])]
            setKeys(changeRef.current)
          }}
        />

        <div className="box-border flex min-h-9 w-full flex-wrap items-center gap-0 rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--color-text-secondary)_15%,transparent)] px-inline py-[3px] peer-focus:border-[color-mix(in_srgb,var(--color-accent)_75%,transparent)]">
          {keys.map((key, index) => (
            <div className="flex" key={key}>
              <span className="px-adjust leading-[25px]" hidden={index === 0}>
                +
              </span>
              <div className="my-adjust rounded-[var(--radius-compact)] border border-[color-mix(in_srgb,var(--color-text-secondary)_20%,transparent)] px-[5px] py-[1px] text-body text-[var(--color-text-primary)]">
                {key}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title={t('shared.actions.delete')}
        className="text-current"
        onClick={() => {
          onChange([])
          setKeys([])
        }}
      >
        <Trash2 />
      </Button>
    </div>
  )
}
