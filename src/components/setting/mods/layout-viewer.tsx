import { convertFileSrc } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { exists } from '@tauri-apps/plugin-fs'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

import {
  BaseDialog,
  BaseStyledSelect,
  DialogRef,
  Switch,
  TooltipIcon,
} from '@/components/base'
import { DEFAULT_HOVER_DELAY } from '@/components/proxy/proxy-group-navigator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SelectItem } from '@/components/ui/select'
import { useVerge } from '@/hooks/use-verge'
import { useWindowDecorations } from '@/hooks/use-window'
import { copyIconFile, getAppDir } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import getSystem from '@/utils/get-system'

import { GuardState } from './guard-state'

const OS = getSystem()

function Item({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-adjust py-[5px]">
      {children}
    </div>
  )
}

function ItemText({ children }: { children: ReactNode }) {
  return <div className="text-[var(--color-text-primary)]">{children}</div>
}

const clampHoverDelay = (value: number) => {
  if (!Number.isFinite(value)) {
    return DEFAULT_HOVER_DELAY
  }
  return Math.min(5000, Math.max(0, Math.round(value)))
}

const getIcons = async (icon_dir: string, name: string) => {
  const updateTime = localStorage.getItem(`icon_${name}_update_time`) || ''

  const icon_png = await join(icon_dir, `${name}-${updateTime}.png`)
  const icon_ico = await join(icon_dir, `${name}-${updateTime}.ico`)

  return {
    icon_png,
    icon_ico,
  }
}

export const LayoutViewer = forwardRef<DialogRef>((_, ref) => {
  const { t } = useTranslation()
  const { verge, patchVerge, mutateVerge } = useVerge()

  const [open, setOpen] = useState(false)
  const [commonIcon, setCommonIcon] = useState('')
  const [sysproxyIcon, setSysproxyIcon] = useState('')
  const [tunIcon, setTunIcon] = useState('')

  const { decorated, toggleDecorations } = useWindowDecorations()

  useEffect(() => {
    initIconPath()
  }, [])

  async function initIconPath() {
    const appDir = await getAppDir()

    const icon_dir = await join(appDir, 'icons')

    const { icon_png: common_icon_png, icon_ico: common_icon_ico } =
      await getIcons(icon_dir, 'common')

    const { icon_png: sysproxy_icon_png, icon_ico: sysproxy_icon_ico } =
      await getIcons(icon_dir, 'sysproxy')

    const { icon_png: tun_icon_png, icon_ico: tun_icon_ico } = await getIcons(
      icon_dir,
      'tun',
    )

    if (await exists(common_icon_ico)) {
      setCommonIcon(common_icon_ico)
    } else {
      setCommonIcon(common_icon_png)
    }
    if (await exists(sysproxy_icon_ico)) {
      setSysproxyIcon(sysproxy_icon_ico)
    } else {
      setSysproxyIcon(sysproxy_icon_png)
    }
    if (await exists(tun_icon_ico)) {
      setTunIcon(tun_icon_ico)
    } else {
      setTunIcon(tun_icon_png)
    }
  }

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
  }))

  const onSwitchFormat = (_e: any, value: boolean) => value
  const onError = (err: any) => {
    showNotice.error(err)
  }
  const onChangeData = (patch: Partial<IVergeConfig>) => {
    mutateVerge({ ...verge, ...patch }, false)
  }

  return (
    <BaseDialog
      open={open}
      title={t('settings.components.verge.layout.title')}
      contentSx={{ width: 450 }}
      disableOk
      cancelBtn={t('shared.actions.close')}
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    >
      <div>
        <Item>
          <ItemText>
            {t('settings.components.verge.layout.fields.preferSystemTitlebar')}
          </ItemText>
          <GuardState
            value={decorated}
            valueProps="checked"
            onCatch={onError}
            onFormat={onSwitchFormat}
            onChange={async () => {
              await toggleDecorations()
            }}
          >
            <Switch />
          </GuardState>
        </Item>

        <Item>
          <ItemText>
            {t('settings.components.verge.layout.fields.trafficGraph')}
          </ItemText>
          <GuardState
            value={verge?.traffic_graph ?? true}
            valueProps="checked"
            onCatch={onError}
            onFormat={onSwitchFormat}
            onChange={(e) => onChangeData({ traffic_graph: e })}
            onGuard={(e) => patchVerge({ traffic_graph: e })}
          >
            <Switch />
          </GuardState>
        </Item>

        <Item>
          <ItemText>
            {t('settings.components.verge.layout.fields.memoryUsage')}
          </ItemText>
          <GuardState
            value={verge?.enable_memory_usage ?? true}
            valueProps="checked"
            onCatch={onError}
            onFormat={onSwitchFormat}
            onChange={(e) => onChangeData({ enable_memory_usage: e })}
            onGuard={(e) => patchVerge({ enable_memory_usage: e })}
          >
            <Switch />
          </GuardState>
        </Item>

        <Item>
          <ItemText>
            {t('settings.components.verge.layout.fields.proxyGroupIcon')}
          </ItemText>
          <GuardState
            value={verge?.enable_group_icon ?? true}
            valueProps="checked"
            onCatch={onError}
            onFormat={onSwitchFormat}
            onChange={(e) => onChangeData({ enable_group_icon: e })}
            onGuard={(e) => patchVerge({ enable_group_icon: e })}
          >
            <Switch />
          </GuardState>
        </Item>

        <Item>
          <ItemText>
            {t(
              'settings.components.verge.layout.fields.pauseRenderTrafficStatsOnBlur',
            )}
          </ItemText>
          <GuardState
            value={verge?.pause_render_traffic_stats_on_blur ?? true}
            valueProps="checked"
            onCatch={onError}
            onFormat={onSwitchFormat}
            onChange={(e) =>
              onChangeData({ pause_render_traffic_stats_on_blur: e })
            }
            onGuard={(e) =>
              patchVerge({ pause_render_traffic_stats_on_blur: e })
            }
          >
            <Switch />
          </GuardState>
        </Item>

        <Item>
          <ItemText>
            {t('settings.components.verge.layout.fields.toastPosition')}
          </ItemText>
          <GuardState
            value={verge?.notice_position ?? 'top-right'}
            onCatch={onError}
            onFormat={(e: any) => e.target.value}
            onChange={(value) => onChangeData({ notice_position: value })}
            onGuard={(value) => patchVerge({ notice_position: value })}
          >
            <BaseStyledSelect className="w-[180px]">
              <SelectItem value="top-right">
                {t(
                  'settings.components.verge.layout.options.toastPosition.topRight',
                )}
              </SelectItem>
              <SelectItem value="top-left">
                {t(
                  'settings.components.verge.layout.options.toastPosition.topLeft',
                )}
              </SelectItem>
              <SelectItem value="bottom-right">
                {t(
                  'settings.components.verge.layout.options.toastPosition.bottomRight',
                )}
              </SelectItem>
              <SelectItem value="bottom-left">
                {t(
                  'settings.components.verge.layout.options.toastPosition.bottomLeft',
                )}
              </SelectItem>
            </BaseStyledSelect>
          </GuardState>
        </Item>

        <Item>
          <div className="flex items-center gap-inline text-[var(--color-text-primary)]">
            <span>
              {t('settings.components.verge.layout.fields.hoverNavigator')}
            </span>
            <TooltipIcon
              title={t(
                'settings.components.verge.layout.tooltips.hoverNavigator',
              )}
              className="opacity-70"
            />
          </div>
          <GuardState
            value={verge?.enable_hover_jump_navigator ?? true}
            valueProps="checked"
            onCatch={onError}
            onFormat={onSwitchFormat}
            onChange={(e) => onChangeData({ enable_hover_jump_navigator: e })}
            onGuard={(e) => patchVerge({ enable_hover_jump_navigator: e })}
          >
            <Switch />
          </GuardState>
        </Item>

        <Item>
          <div className="flex items-center gap-inline text-[var(--color-text-primary)]">
            <span>
              {t('settings.components.verge.layout.fields.hoverNavigatorDelay')}
            </span>
            <TooltipIcon
              title={t(
                'settings.components.verge.layout.tooltips.hoverNavigatorDelay',
              )}
              className="opacity-70"
            />
          </div>
          <div className="relative w-[120px]">
            <GuardState
              value={verge?.hover_jump_navigator_delay ?? DEFAULT_HOVER_DELAY}
              waitTime={400}
              onCatch={onError}
              onFormat={(e: any) => clampHoverDelay(Number(e.target.value))}
              onChange={(value) =>
                onChangeData({
                  hover_jump_navigator_delay: clampHoverDelay(value),
                })
              }
              onGuard={(value) =>
                patchVerge({
                  hover_jump_navigator_delay: clampHoverDelay(value),
                })
              }
            >
              <Input
                type="number"
                className="w-full pr-12"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                min={0}
                max={5000}
                step={20}
                disabled={!(verge?.enable_hover_jump_navigator ?? true)}
              />
            </GuardState>
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-body text-[var(--color-text-muted)]">
              {t('shared.units.milliseconds')}
            </span>
          </div>
        </Item>

        <Item>
          <ItemText>
            {t('settings.components.verge.layout.fields.navIcon')}
          </ItemText>
          <GuardState
            value={verge?.menu_icon ?? 'monochrome'}
            onCatch={onError}
            onFormat={(e: any) => e.target.value}
            onChange={(value) => onChangeData({ menu_icon: value })}
            onGuard={(value) => patchVerge({ menu_icon: value })}
          >
            <BaseStyledSelect className="w-[140px]">
              <SelectItem value="monochrome">
                {t('settings.components.verge.layout.options.icon.monochrome')}
              </SelectItem>
              <SelectItem value="colorful">
                {t('settings.components.verge.layout.options.icon.colorful')}
              </SelectItem>
              <SelectItem value="disable">
                {t('settings.components.verge.layout.options.icon.disable')}
              </SelectItem>
            </BaseStyledSelect>
          </GuardState>
        </Item>

        <Item>
          <ItemText>
            {t('settings.components.verge.layout.fields.collapseNavBar')}
          </ItemText>
          <GuardState
            value={verge?.collapse_navbar ?? false}
            valueProps="checked"
            onCatch={onError}
            onFormat={onSwitchFormat}
            onChange={(e) => onChangeData({ collapse_navbar: e })}
            onGuard={(e) => patchVerge({ collapse_navbar: e })}
          >
            <Switch />
          </GuardState>
        </Item>

        {OS === 'macos' && (
          <Item>
            <ItemText>
              {t('settings.components.verge.layout.fields.trayIcon')}
            </ItemText>
            <GuardState
              value={verge?.tray_icon ?? 'monochrome'}
              onCatch={onError}
              onFormat={(e: any) => e.target.value}
              onChange={(e) => onChangeData({ tray_icon: e })}
              onGuard={(e) => patchVerge({ tray_icon: e })}
            >
              <BaseStyledSelect className="w-[140px]">
                <SelectItem value="monochrome">
                  {t(
                    'settings.components.verge.layout.options.icon.monochrome',
                  )}
                </SelectItem>
                <SelectItem value="colorful">
                  {t('settings.components.verge.layout.options.icon.colorful')}
                </SelectItem>
              </BaseStyledSelect>
            </GuardState>
          </Item>
        )}
        {OS === 'macos' && (
          <Item>
            <ItemText>
              {t('settings.components.verge.layout.fields.enableTraySpeed')}
            </ItemText>
            <GuardState
              value={verge?.enable_tray_speed ?? false}
              valueProps="checked"
              onCatch={onError}
              onFormat={onSwitchFormat}
              onChange={(e) => onChangeData({ enable_tray_speed: e })}
              onGuard={(e) => patchVerge({ enable_tray_speed: e })}
            >
              <Switch />
            </GuardState>
          </Item>
        )}
        {/* {OS === "macos" && (
          <Item>
            <ListItemText primary={t("settings.components.verge.layout.fields.enableTrayIcon")} />
            <GuardState
              value={
                verge?.enable_tray_icon === false &&
                verge?.enable_tray_speed === false
                  ? true
                  : (verge?.enable_tray_icon ?? true)
              }
              valueProps="checked"
              onCatch={onError}
              onFormat={onSwitchFormat}
              onChange={(e) => onChangeData({ enable_tray_icon: e })}
              onGuard={(e) => patchVerge({ enable_tray_icon: e })}
            >
              <Switch edge="end" />
            </GuardState>
          </Item>
        )} */}
        <Item>
          <ItemText>
            {t(
              'settings.components.verge.layout.fields.proxyGroupsDisplayMode',
            )}
          </ItemText>
          <GuardState
            value={verge?.tray_proxy_groups_display_mode ?? 'default'}
            onCatch={onError}
            onFormat={(e: any) => e.target.value}
            onChange={(value) =>
              onChangeData({ tray_proxy_groups_display_mode: value })
            }
            onGuard={(value) =>
              patchVerge({ tray_proxy_groups_display_mode: value })
            }
          >
            <BaseStyledSelect className="w-[140px]">
              <SelectItem value="default">
                {t(
                  'settings.components.verge.layout.options.proxyGroupsDisplayMode.default',
                )}
              </SelectItem>
              <SelectItem value="inline">
                {t(
                  'settings.components.verge.layout.options.proxyGroupsDisplayMode.inline',
                )}
              </SelectItem>
              <SelectItem value="disable">
                {t(
                  'settings.components.verge.layout.options.proxyGroupsDisplayMode.disable',
                )}
              </SelectItem>
            </BaseStyledSelect>
          </GuardState>
        </Item>
        <Item>
          <ItemText>
            {t(
              'settings.components.verge.layout.fields.showOutboundModesInline',
            )}
          </ItemText>
          <GuardState
            value={verge?.tray_inline_outbound_modes ?? false}
            valueProps="checked"
            onCatch={onError}
            onFormat={onSwitchFormat}
            onChange={(e) => onChangeData({ tray_inline_outbound_modes: e })}
            onGuard={(e) => patchVerge({ tray_inline_outbound_modes: e })}
          >
            <Switch />
          </GuardState>
        </Item>

        <Item>
          <ItemText>
            {t('settings.components.verge.layout.fields.commonTrayIcon')}
          </ItemText>
          <GuardState
            value={verge?.common_tray_icon}
            onCatch={onError}
            onChange={(e) => onChangeData({ common_tray_icon: e })}
            onGuard={(e) => patchVerge({ common_tray_icon: e })}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (verge?.common_tray_icon) {
                  onChangeData({ common_tray_icon: false })
                  patchVerge({ common_tray_icon: false })
                } else {
                  const selected = await openDialog({
                    directory: false,
                    multiple: false,
                    filters: [
                      {
                        name: 'Tray Icon Image',
                        extensions: ['png', 'ico'],
                      },
                    ],
                  })

                  if (selected) {
                    await copyIconFile(`${selected}`, 'common')
                    await initIconPath()
                    onChangeData({ common_tray_icon: true })
                    patchVerge({ common_tray_icon: true })
                  }
                }
              }}
            >
              {verge?.common_tray_icon && commonIcon && (
                <img className="h-5" src={convertFileSrc(commonIcon)} />
              )}
              {verge?.common_tray_icon
                ? t('shared.actions.clear')
                : t('settings.components.verge.basic.actions.browse')}
            </Button>
          </GuardState>
        </Item>

        <Item>
          <ItemText>
            {t('settings.components.verge.layout.fields.systemProxyTrayIcon')}
          </ItemText>
          <GuardState
            value={verge?.sysproxy_tray_icon}
            onCatch={onError}
            onChange={(e) => onChangeData({ sysproxy_tray_icon: e })}
            onGuard={(e) => patchVerge({ sysproxy_tray_icon: e })}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (verge?.sysproxy_tray_icon) {
                  onChangeData({ sysproxy_tray_icon: false })
                  patchVerge({ sysproxy_tray_icon: false })
                } else {
                  const selected = await openDialog({
                    directory: false,
                    multiple: false,
                    filters: [
                      {
                        name: 'Tray Icon Image',
                        extensions: ['png', 'ico'],
                      },
                    ],
                  })
                  if (selected) {
                    await copyIconFile(`${selected}`, 'sysproxy')
                    await initIconPath()
                    onChangeData({ sysproxy_tray_icon: true })
                    patchVerge({ sysproxy_tray_icon: true })
                  }
                }
              }}
            >
              {verge?.sysproxy_tray_icon && sysproxyIcon && (
                <img className="h-5" src={convertFileSrc(sysproxyIcon)} />
              )}
              {verge?.sysproxy_tray_icon
                ? t('shared.actions.clear')
                : t('settings.components.verge.basic.actions.browse')}
            </Button>
          </GuardState>
        </Item>

        <Item>
          <ItemText>
            {t('settings.components.verge.layout.fields.tunTrayIcon')}
          </ItemText>
          <GuardState
            value={verge?.tun_tray_icon}
            onCatch={onError}
            onChange={(e) => onChangeData({ tun_tray_icon: e })}
            onGuard={(e) => patchVerge({ tun_tray_icon: e })}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (verge?.tun_tray_icon) {
                  onChangeData({ tun_tray_icon: false })
                  patchVerge({ tun_tray_icon: false })
                } else {
                  const selected = await openDialog({
                    directory: false,
                    multiple: false,
                    filters: [
                      {
                        name: 'Tun Icon Image',
                        extensions: ['png', 'ico'],
                      },
                    ],
                  })
                  if (selected) {
                    await copyIconFile(`${selected}`, 'tun')
                    await initIconPath()
                    onChangeData({ tun_tray_icon: true })
                    patchVerge({ tun_tray_icon: true })
                  }
                }
              }}
            >
              {verge?.tun_tray_icon && tunIcon && (
                <img className="h-5" src={convertFileSrc(tunIcon)} />
              )}
              {verge?.tun_tray_icon
                ? t('shared.actions.clear')
                : t('settings.components.verge.basic.actions.browse')}
            </Button>
          </GuardState>
        </Item>
      </div>
    </BaseDialog>
  )
})
