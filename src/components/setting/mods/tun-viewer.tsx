import { useLockFn } from 'ahooks'
import type { Ref } from 'react'
import { useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  BaseDialog,
  BaseSplitChipEditor,
  TooltipIcon,
  DialogRef,
  Switch,
} from '@/components/base'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useClash } from '@/hooks/use-clash'
import { enhanceProfiles } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import getSystem from '@/utils/get-system'
import { areValidIpCidrs } from '@/utils/network'

import { StackModeSwitch } from './stack-mode-switch'

const OS = getSystem()

const splitRouteExcludeAddress = (value: string) =>
  value
    .split(/[,\n;\r]+/)
    .map((item) => item.trim())
    .filter(Boolean)

export function TunViewer({ ref }: { ref?: Ref<DialogRef> }) {
  const { t } = useTranslation()

  const { clash, mutateClash, patchClash } = useClash()

  const [open, setOpen] = useState(false)
  const [values, setValues] = useState({
    stack: 'mixed',
    device: OS === 'macos' ? 'utun1024' : 'Mihomo',
    autoRoute: true,
    routeExcludeAddress: '',
    autoRedirect: false,
    autoDetectInterface: true,
    dnsHijack: ['any:53'],
    strictRoute: false,
    mtu: 1500,
  })

  const routeExcludeAddressItems = splitRouteExcludeAddress(
    values.routeExcludeAddress,
  )
  const routeExcludeAddressError =
    values.autoRoute &&
    routeExcludeAddressItems.length > 0 &&
    !areValidIpCidrs(routeExcludeAddressItems)
  const routeExcludeAddressHelperText = routeExcludeAddressError
    ? t('settings.modals.tun.messages.invalidRouteExcludeAddress')
    : t('settings.modals.tun.messages.routeExcludeAddressHint')

  useImperativeHandle(ref, () => ({
    open: () => {
      setOpen(true)
      const nextAutoRoute = clash?.tun['auto-route'] ?? true
      const rawAutoRedirect = clash?.tun['auto-redirect'] ?? false
      const computedAutoRedirect =
        OS === 'linux' ? (nextAutoRoute ? rawAutoRedirect : false) : false
      setValues({
        stack: clash?.tun.stack ?? 'gvisor',
        device: clash?.tun.device ?? (OS === 'macos' ? 'utun1024' : 'Mihomo'),
        autoRoute: nextAutoRoute,
        routeExcludeAddress: (clash?.tun['route-exclude-address'] ?? []).join(
          ',',
        ),
        autoRedirect: computedAutoRedirect,
        autoDetectInterface: clash?.tun['auto-detect-interface'] ?? true,
        dnsHijack: clash?.tun['dns-hijack'] ?? ['any:53'],
        strictRoute: clash?.tun['strict-route'] ?? false,
        mtu: clash?.tun.mtu ?? 1500,
      })
    },
    close: () => setOpen(false),
  }))

  const onSave = useLockFn(async () => {
    try {
      const routeExcludeAddress = routeExcludeAddressItems

      if (routeExcludeAddressError) {
        showNotice.error(
          'settings.modals.tun.messages.invalidRouteExcludeAddress',
        )
        return
      }

      const tun: IConfigData['tun'] = {
        stack: values.stack,
        device:
          values.device === ''
            ? OS === 'macos'
              ? 'utun1024'
              : 'Mihomo'
            : values.device,
        'auto-route': values.autoRoute,
        'route-exclude-address': routeExcludeAddress,
        ...(OS === 'linux'
          ? {
              'auto-redirect': values.autoRedirect,
            }
          : {}),
        'auto-detect-interface': values.autoDetectInterface,
        'dns-hijack': values.dnsHijack[0] === '' ? [] : values.dnsHijack,
        'strict-route': values.strictRoute,
        mtu: values.mtu ?? 1500,
      }
      await patchClash({ tun })
      await mutateClash(
        (old) => ({
          ...old!,
          tun,
        }),
        false,
      )
      setOpen(false)
      showNotice.success('settings.modals.tun.messages.applied')
      void enhanceProfiles().catch((err: any) => {
        showNotice.error(err)
      })
    } catch (err: any) {
      showNotice.error(err)
    }
  })

  return (
    <BaseDialog
      open={open}
      title={
        <div className="flex items-center justify-between gap-component">
          <span>{t('settings.modals.tun.title')}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const tun: IConfigData['tun'] = {
                stack: 'gvisor',
                device: OS === 'macos' ? 'utun1024' : 'Mihomo',
                'auto-route': true,
                ...(OS === 'linux'
                  ? {
                      'auto-redirect': false,
                    }
                  : {}),
                'auto-detect-interface': true,
                'dns-hijack': ['any:53'],
                'route-exclude-address': [],
                'strict-route': false,
                mtu: 1500,
              }
              setValues({
                stack: 'gvisor',
                device: OS === 'macos' ? 'utun1024' : 'Mihomo',
                autoRoute: true,
                routeExcludeAddress: '',
                autoRedirect: false,
                autoDetectInterface: true,
                dnsHijack: ['any:53'],
                strictRoute: false,
                mtu: 1500,
              })
              await patchClash({ tun })
              await mutateClash(
                (old) => ({
                  ...old!,
                  tun,
                }),
                false,
              )
            }}
          >
            {t('shared.actions.resetToDefault')}
          </Button>
        </div>
      }
      contentSx={{ width: 450 }}
      okBtn={t('shared.actions.save')}
      cancelBtn={t('shared.actions.cancel')}
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
      onOk={onSave}
    >
      <div className="py-component">
        <div className="flex items-center gap-component py-[5px] px-adjust">
          <span className="flex-1">
            {t('settings.modals.tun.fields.stack')}
          </span>
          <StackModeSwitch
            value={values.stack}
            onChange={(value) => {
              setValues((v) => ({
                ...v,
                stack: value,
              }))
            }}
          />
        </div>

        <div className="flex items-center gap-component py-[5px] px-adjust">
          <span className="flex-1">
            {t('settings.modals.tun.fields.device')}
          </span>
          <Input
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-8 w-[250px]"
            value={values.device}
            placeholder="Mihomo"
            onChange={(e) =>
              setValues((v) => ({ ...v, device: e.target.value }))
            }
          />
        </div>

        <div className="flex items-center gap-component py-[5px] px-adjust">
          <span className="flex-1">
            {t('settings.modals.tun.fields.autoRoute')}
          </span>
          <Switch
            checked={values.autoRoute}
            onCheckedChange={(c) =>
              setValues((v) => ({
                ...v,
                autoRoute: c,
                autoRedirect: c ? v.autoRedirect : false,
              }))
            }
          />
        </div>

        {OS === 'linux' && (
          <div className="flex items-center gap-component py-[5px] px-adjust">
            <span className="max-w-fit">
              {t('settings.modals.tun.fields.autoRedirect')}
            </span>
            <TooltipIcon
              title={t('settings.modals.tun.tooltips.autoRedirect')}
              className={values.autoRoute ? 'opacity-70' : 'opacity-30'}
            />
            <Switch
              className="ml-auto"
              checked={values.autoRedirect}
              onCheckedChange={(c) =>
                setValues((v) => ({
                  ...v,
                  autoRedirect: v.autoRoute ? c : v.autoRedirect,
                }))
              }
              disabled={!values.autoRoute}
            />
          </div>
        )}

        <div className="flex items-center gap-component py-[5px] px-adjust">
          <span className="flex-1">
            {t('settings.modals.tun.fields.strictRoute')}
          </span>
          <Switch
            checked={values.strictRoute}
            onCheckedChange={(c) =>
              setValues((v) => ({ ...v, strictRoute: c }))
            }
          />
        </div>

        <div className="flex items-center gap-component py-[5px] px-adjust">
          <span className="flex-1">
            {t('settings.modals.tun.fields.autoDetectInterface')}
          </span>
          <Switch
            checked={values.autoDetectInterface}
            onCheckedChange={(c) =>
              setValues((v) => ({ ...v, autoDetectInterface: c }))
            }
          />
        </div>

        <div className="flex items-center gap-component py-[5px] px-adjust">
          <span className="flex-1">
            {t('settings.modals.tun.fields.dnsHijack')}
          </span>
          <Input
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-8 w-[250px]"
            value={values.dnsHijack.join(',')}
            placeholder={t('settings.modals.tun.tooltips.dnsHijack')}
            onChange={(e) =>
              setValues((v) => ({ ...v, dnsHijack: e.target.value.split(',') }))
            }
          />
        </div>

        <div className="flex items-center gap-component py-[5px] px-adjust">
          <span className="flex-1">{t('settings.modals.tun.fields.mtu')}</span>
          <Input
            autoComplete="new-password"
            type="number"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-8 w-[250px]"
            value={values.mtu}
            placeholder="1500"
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                mtu: parseInt(e.target.value),
              }))
            }
          />
        </div>

        <BaseSplitChipEditor
          value={values.routeExcludeAddress}
          placeholder="192.168.0.0/16"
          ariaLabel={t('settings.modals.tun.fields.routeExcludeAddress')}
          disabled={!values.autoRoute}
          error={routeExcludeAddressError}
          helperText={routeExcludeAddressHelperText}
          onChange={(nextValue) =>
            setValues((v) => ({ ...v, routeExcludeAddress: nextValue }))
          }
          renderHeader={(modeToggle) => (
            <div className="flex items-center gap-component py-[5px] px-adjust">
              <span className="flex-1">
                {t('settings.modals.tun.fields.routeExcludeAddress')}
              </span>
              {modeToggle ? <div className="ml-auto">{modeToggle}</div> : null}
            </div>
          )}
        />
      </div>
    </BaseDialog>
  )
}
