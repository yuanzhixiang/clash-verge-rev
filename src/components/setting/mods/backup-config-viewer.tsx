import { useLockFn } from 'ahooks'
import { Eye, EyeOff } from 'lucide-react'
import { useState, useRef, memo, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useVerge } from '@/hooks/use-verge'
import { saveWebdavConfig, createWebdavBackup } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import {
  buildWebdavSignature,
  getWebdavStatus,
  setWebdavStatus,
} from '@/services/webdav-status'
import { isValidUrl } from '@/utils/network'

interface BackupConfigViewerProps {
  onBackupSuccess: () => Promise<void>
  onSaveSuccess: (signature?: string) => Promise<void>
  onRefresh: () => Promise<void>
  onInit: () => Promise<void>
  setLoading: (loading: boolean) => void
}

export const BackupConfigViewer = memo(
  ({
    onBackupSuccess,
    onSaveSuccess,
    onRefresh,
    onInit,
    setLoading,
  }: BackupConfigViewerProps) => {
    const { t } = useTranslation()
    const { verge, mutateVerge } = useVerge()
    const { webdav_url, webdav_username, webdav_password } = verge || {}
    const [showPassword, setShowPassword] = useState(false)
    const usernameRef = useRef<HTMLInputElement>(null)
    const passwordRef = useRef<HTMLInputElement>(null)
    const urlRef = useRef<HTMLInputElement>(null)

    const { register, handleSubmit, watch } = useForm<IWebDavConfig>({
      defaultValues: {
        url: webdav_url,
        username: webdav_username,
        password: webdav_password,
      },
    })
    const url = watch('url')
    const username = watch('username')
    const password = watch('password')

    // 合并 react-hook-form 的 register ref 与本地 focus 用 ref，
    // 使二者都指向真实的 input 元素（原 MUI inputRef 语义）。
    const urlReg = register('url')
    const usernameReg = register('username')
    const passwordReg = register('password')

    const webdavChanged =
      webdav_url !== url ||
      webdav_username !== username ||
      webdav_password !== password

    const webdavSignature = buildWebdavSignature(verge)
    const webdavStatus = getWebdavStatus(webdavSignature)
    const shouldAutoInit = webdavStatus !== 'failed'

    const handleClickShowPassword = () => {
      setShowPassword((prev) => !prev)
    }

    useEffect(() => {
      if (!webdav_url || !webdav_username || !webdav_password) {
        return
      }
      if (!shouldAutoInit) {
        return
      }
      void onInit()
    }, [webdav_url, webdav_username, webdav_password, onInit, shouldAutoInit])

    const checkForm = () => {
      const username = usernameRef.current?.value
      const password = passwordRef.current?.value
      const url = urlRef.current?.value

      if (!url) {
        urlRef.current?.focus()
        showNotice.error('settings.modals.backup.messages.webdavUrlRequired')
        throw new Error(t('settings.modals.backup.messages.webdavUrlRequired'))
      } else if (!isValidUrl(url)) {
        urlRef.current?.focus()
        showNotice.error('settings.modals.backup.messages.invalidWebdavUrl')
        throw new Error(t('settings.modals.backup.messages.invalidWebdavUrl'))
      }
      if (!username) {
        usernameRef.current?.focus()
        showNotice.error('settings.modals.backup.messages.usernameRequired')
        throw new Error(t('settings.modals.backup.messages.usernameRequired'))
      }
      if (!password) {
        passwordRef.current?.focus()
        showNotice.error('settings.modals.backup.messages.passwordRequired')
        throw new Error(t('settings.modals.backup.messages.passwordRequired'))
      }
    }

    const save = useLockFn(async (data: IWebDavConfig) => {
      checkForm()
      const signature = buildWebdavSignature({
        webdav_url: data.url,
        webdav_username: data.username,
        webdav_password: data.password,
      })
      const trimmedUrl = data.url.trim()
      const trimmedUsername = data.username.trim()

      try {
        setLoading(true)
        await saveWebdavConfig(trimmedUrl, trimmedUsername, data.password)
        await mutateVerge(
          (current) =>
            current
              ? {
                  ...current,
                  webdav_url: trimmedUrl,
                  webdav_username: trimmedUsername,
                  webdav_password: data.password,
                }
              : current,
          false,
        )
        setWebdavStatus(signature, 'unknown')
        showNotice.success('settings.modals.backup.messages.webdavConfigSaved')
        await onSaveSuccess(signature)
      } catch (error) {
        showNotice.error(
          'settings.modals.backup.messages.webdavConfigSaveFailed',
          { error },
          3000,
        )
      } finally {
        setLoading(false)
      }
    })

    const handleBackup = useLockFn(async () => {
      checkForm()
      const signature = buildWebdavSignature({
        webdav_url: url,
        webdav_username: username,
        webdav_password: password,
      })

      try {
        setLoading(true)
        await createWebdavBackup().then(async () => {
          showNotice.success('settings.modals.backup.messages.backupCreated')
          await onBackupSuccess()
        })
        setWebdavStatus(signature, 'ready')
      } catch (error) {
        showNotice.error('settings.modals.backup.messages.backupFailed', {
          error,
        })
        setWebdavStatus(signature, 'failed')
      } finally {
        setLoading(false)
      }
    })

    return (
      <form onSubmit={(e) => e.preventDefault()}>
        <div className="flex flex-col gap-inset sm:flex-row">
          <div className="flex min-w-0 flex-col gap-inset sm:flex-[3]">
            <div className="mt-inline flex flex-col gap-inline">
              <Label htmlFor="webdav-url">
                {t('settings.modals.backup.fields.webdavUrl')}
              </Label>
              <Input
                id="webdav-url"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                {...urlReg}
                ref={(el) => {
                  urlReg.ref(el)
                  urlRef.current = el
                }}
              />
            </div>
            <div className="flex gap-inset">
              <div className="flex flex-1 flex-col gap-inline">
                <Label htmlFor="webdav-username">
                  {t('settings.modals.backup.fields.username')}
                </Label>
                <Input
                  id="webdav-username"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  {...usernameReg}
                  ref={(el) => {
                    usernameReg.ref(el)
                    usernameRef.current = el
                  }}
                />
              </div>
              <div className="flex flex-1 flex-col gap-inline">
                <Label htmlFor="webdav-password">
                  {t('shared.labels.password')}
                </Label>
                <div className="relative">
                  <Input
                    id="webdav-password"
                    type={showPassword ? 'text' : 'password'}
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    className="pr-9"
                    {...passwordReg}
                    ref={(el) => {
                      passwordReg.ref(el)
                      passwordRef.current = el
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleClickShowPassword}
                    className="absolute top-1/2 right-1 -translate-y-1/2 text-[var(--color-text-secondary)]"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="sm:flex-1">
            <div className="flex h-full flex-col items-stretch justify-between gap-stack">
              {webdavChanged ||
              webdav_url === undefined ||
              webdav_username === undefined ||
              webdav_password === undefined ? (
                <Button
                  className="h-full w-full"
                  type="button"
                  onClick={handleSubmit(save)}
                >
                  {t('shared.actions.save')}
                </Button>
              ) : (
                <>
                  <Button
                    className="w-full bg-[var(--color-success)] text-white hover:opacity-90"
                    onClick={handleBackup}
                    type="button"
                  >
                    {t('settings.modals.backup.actions.backup')}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={onRefresh}
                    type="button"
                  >
                    {t('shared.actions.refresh')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </form>
    )
  },
)
