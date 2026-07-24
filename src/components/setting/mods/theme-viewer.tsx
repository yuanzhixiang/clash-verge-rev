import { useLockFn } from 'ahooks'
import { Pencil } from 'lucide-react'
import { useTheme } from 'next-themes'
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, DialogRef } from '@/components/base'
import { EditorViewer } from '@/components/profile/editor-viewer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useVerge } from '@/hooks/use-verge'
import { defaultDarkTheme, defaultTheme } from '@/pages/_theme'
import { showNotice } from '@/services/notice-service'

export function ThemeViewer(props: { ref?: React.Ref<DialogRef> }) {
  const { ref } = props
  const { t } = useTranslation()

  const [open, setOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [cssEditorValue, setCssEditorValue] = useState('')
  const [cssEditorSavedValue, setCssEditorSavedValue] = useState('')
  const { verge, patchVerge } = useVerge()
  const { theme_setting } = verge ?? {}
  const [theme, setTheme] = useState(theme_setting || {})
  // Latest theme ref to avoid stale closures when saving CSS
  const themeRef = useRef(theme)
  useEffect(() => {
    themeRef.current = theme
  }, [theme])

  useImperativeHandle(ref, () => ({
    open: () => {
      setOpen(true)
      setTheme({ ...theme_setting })
    },
    close: () => setOpen(false),
  }))

  const handleChange = (field: keyof typeof theme) => (e: any) => {
    setTheme((t) => ({ ...t, [field]: e.target.value }))
  }

  const onSave = useLockFn(async () => {
    try {
      await patchVerge({ theme_setting: theme })
      setOpen(false)
    } catch (err) {
      showNotice.error(err)
    }
  })

  const { resolvedTheme } = useTheme()

  const dt = resolvedTheme === 'dark' ? defaultDarkTheme : defaultTheme

  type ThemeKey = keyof typeof theme & keyof typeof defaultTheme

  const fieldDefinitions: Array<{ labelKey: string; key: ThemeKey }> = useMemo(
    () => [
      {
        labelKey: 'settings.components.verge.theme.fields.primaryColor',
        key: 'primary_color',
      },
      {
        labelKey: 'settings.components.verge.theme.fields.secondaryColor',
        key: 'secondary_color',
      },
      {
        labelKey: 'settings.components.verge.theme.fields.primaryText',
        key: 'primary_text',
      },
      {
        labelKey: 'settings.components.verge.theme.fields.secondaryText',
        key: 'secondary_text',
      },
      {
        labelKey: 'settings.components.verge.theme.fields.infoColor',
        key: 'info_color',
      },
      {
        labelKey: 'settings.components.verge.theme.fields.warningColor',
        key: 'warning_color',
      },
      {
        labelKey: 'settings.components.verge.theme.fields.errorColor',
        key: 'error_color',
      },
      {
        labelKey: 'settings.components.verge.theme.fields.successColor',
        key: 'success_color',
      },
    ],
    [],
  )

  const openCssEditor = () => {
    const nextCss = themeRef.current?.css_injection ?? ''
    setCssEditorValue(nextCss)
    setCssEditorSavedValue(nextCss)
    setEditorOpen(true)
  }

  const handleSaveCss = useLockFn(async () => {
    const prevTheme = themeRef.current || {}
    setTheme({ ...prevTheme, css_injection: cssEditorValue })
    setCssEditorSavedValue(cssEditorValue)
  })

  const renderItem = (labelKey: string, key: ThemeKey) => {
    const label = t(labelKey)
    return (
      <div
        key={key}
        className="flex items-center gap-component py-[5px] px-adjust"
      >
        <span className="flex-1">{label}</span>
        <span
          className="inline-block size-6 rounded-[var(--radius-overlay)]"
          style={{ background: theme[key] || dt[key] }}
        />
        <Input
          autoComplete="off"
          className="h-8 w-[135px]"
          value={theme[key] ?? ''}
          placeholder={dt[key]}
          onChange={handleChange(key)}
          onKeyDown={(e) => e.key === 'Enter' && onSave()}
        />
      </div>
    )
  }

  return (
    <BaseDialog
      open={open}
      title={t('settings.components.verge.theme.title')}
      okBtn={t('shared.actions.save')}
      cancelBtn={t('shared.actions.cancel')}
      contentSx={{ width: 400, maxHeight: 505, overflow: 'auto', pb: 0 }}
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
      onOk={onSave}
    >
      <div>
        {fieldDefinitions.map((field) => renderItem(field.labelKey, field.key))}

        <div className="flex items-center gap-component py-[5px] px-adjust">
          <span className="flex-1">
            {t('settings.components.verge.theme.fields.fontFamily')}
          </span>
          <Input
            autoComplete="off"
            className="h-8 w-[135px]"
            value={theme.font_family ?? ''}
            onChange={handleChange('font_family')}
            onKeyDown={(e) => e.key === 'Enter' && onSave()}
          />
        </div>
        <div className="flex items-center gap-component py-[5px] px-adjust">
          <span className="flex-1">
            {t('settings.components.verge.theme.fields.cssInjection')}
          </span>
          <Button variant="outline" size="sm" onClick={openCssEditor}>
            <Pencil className="size-4" />
            {t('settings.components.verge.theme.actions.editCss')}
          </Button>
          {editorOpen && (
            <EditorViewer
              open={true}
              title={t('settings.components.verge.theme.dialogs.editCssTitle')}
              value={cssEditorValue}
              language="css"
              path="theme-css.css"
              dirty={cssEditorValue !== cssEditorSavedValue}
              onChange={setCssEditorValue}
              onSave={handleSaveCss}
              onClose={() => {
                setEditorOpen(false)
              }}
            />
          )}
        </div>
      </div>
    </BaseDialog>
  )
}
