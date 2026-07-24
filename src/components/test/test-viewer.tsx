import { useLockFn } from 'ahooks'
import { nanoid } from 'nanoid'
import { forwardRef, useImperativeHandle, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { BaseDialog } from '@/components/base'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useVerge } from '@/hooks/use-verge'
import { showNotice } from '@/services/notice-service'

interface Props {
  onChange: (uid: string, patch?: Partial<IVergeTestItem>) => void
}

export interface TestViewerRef {
  create: () => void
  edit: (item: IVergeTestItem) => void
}

// create or edit the test item
export const TestViewer = forwardRef<TestViewerRef, Props>(
  ({ onChange }, ref) => {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [openType, setOpenType] = useState<'new' | 'edit'>('new')
    const [loading, setLoading] = useState(false)
    const { verge, patchVerge } = useVerge()
    const testList = verge?.test_list ?? []
    const { control, ...formIns } = useForm<IVergeTestItem>({
      defaultValues: {
        name: '',
        icon: '',
        url: '',
      },
    })

    const patchTestList = async (
      uid: string,
      patch: Partial<IVergeTestItem>,
    ) => {
      const newList = testList.map((x) => {
        if (x.uid === uid) {
          return { ...x, ...patch }
        }
        return x
      })
      await patchVerge({ test_list: newList })
    }

    useImperativeHandle(ref, () => ({
      create: () => {
        setOpenType('new')
        setOpen(true)
      },
      edit: (item) => {
        if (item) {
          Object.entries(item).forEach(([key, value]) => {
            formIns.setValue(key as any, value)
          })
        }
        setOpenType('edit')
        setOpen(true)
      },
    }))

    const handleOk = useLockFn(
      formIns.handleSubmit(async (form) => {
        setLoading(true)
        try {
          if (!form.name) throw new Error('`Name` should not be null')
          if (!form.url) throw new Error('`Url` should not be null')

          let newList
          let uid

          if (form.icon && form.icon.startsWith('<svg')) {
            // 移除 icon 中的注释
            if (form.icon) {
              form.icon = form.icon.replace(/<!--[\s\S]*?-->/g, '')
            }
            const doc = new DOMParser().parseFromString(
              form.icon,
              'image/svg+xml',
            )
            if (doc.querySelector('parsererror')) {
              throw new Error('`Icon`svg format error')
            }
          }

          if (openType === 'new') {
            uid = nanoid()
            const item = { ...form, uid }
            newList = [...testList, item]
            await patchVerge({ test_list: newList })
            onChange(uid)
          } else {
            if (!form.uid) throw new Error('UID not found')
            uid = form.uid

            await patchTestList(uid, form)
            onChange(uid, form)
          }
          setOpen(false)
          setLoading(false)
          setTimeout(() => formIns.reset(), 500)
        } catch (err: any) {
          showNotice.error(err)
          setLoading(false)
        }
      }),
    )

    const handleClose = () => {
      setOpen(false)
      setTimeout(() => formIns.reset(), 500)
    }

    return (
      <BaseDialog
        open={open}
        title={
          openType === 'new'
            ? t('tests.modals.test.title.create')
            : t('tests.modals.test.title.edit')
        }
        contentSx={{ width: 375, pb: 0, maxHeight: '80%' }}
        okBtn={t('shared.actions.save')}
        cancelBtn={t('shared.actions.cancel')}
        onClose={handleClose}
        onCancel={handleClose}
        onOk={handleOk}
        loading={loading}
      >
        <div className="flex flex-col gap-stack">
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <div className="flex flex-col gap-inline">
                <Label htmlFor="test-name">{t('shared.labels.name')}</Label>
                <Input
                  id="test-name"
                  autoComplete="off"
                  autoCorrect="off"
                  {...field}
                />
              </div>
            )}
          />
          <Controller
            name="icon"
            control={control}
            render={({ field }) => (
              <div className="flex flex-col gap-inline">
                <Label htmlFor="test-icon">{t('shared.labels.icon')}</Label>
                <Textarea
                  id="test-icon"
                  autoComplete="off"
                  autoCorrect="off"
                  className="max-h-[7.5rem]"
                  {...field}
                />
              </div>
            )}
          />
          <Controller
            name="url"
            control={control}
            render={({ field }) => (
              <div className="flex flex-col gap-inline">
                <Label htmlFor="test-url">
                  {t('tests.modals.test.fields.url')}
                </Label>
                <Textarea
                  id="test-url"
                  autoComplete="off"
                  autoCorrect="off"
                  className="max-h-[4.5rem]"
                  {...field}
                />
              </div>
            )}
          />
        </div>
      </BaseDialog>
    )
  },
)
