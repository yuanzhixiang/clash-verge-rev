import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-shell'
import { useLockFn } from 'ahooks'
import dayjs from 'dayjs'
import {
  Ellipsis,
  GripVertical,
  Loader2,
  RefreshCw,
  Square,
  SquareCheck,
} from 'lucide-react'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog } from '@/components/base'
import { EditorViewer } from '@/components/profile/editor-viewer'
import { GroupsEditorViewer } from '@/components/profile/groups-editor-viewer'
import { RulesEditorViewer } from '@/components/profile/rules-editor-viewer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useEditorDocument } from '@/hooks/use-editor-document'
import { cn } from '@/lib/utils'
import {
  convertProfileToConf,
  getNextUpdateTime,
  readProfileFile,
  revealProfileFile,
  saveProfileFile,
  updateProfile,
  viewProfile,
} from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import { useLoadingCache, useSetLoadingCache } from '@/services/states'
import type { TranslationKey } from '@/types/generated/i18n-keys'
import { debugLog } from '@/utils/debug'
import parseTraffic from '@/utils/parse-traffic'

import { ProfileBox } from './profile-box'
import { ProxiesEditorViewer } from './proxies-editor-viewer'
import { QrViewer } from './qr-viewer'

interface Props {
  id: string
  selected: boolean
  activating: boolean
  itemData: IProfileItem
  mutateProfiles: () => Promise<void>
  onSelect: (force: boolean) => void
  onEdit: () => void
  onSave?: (prev?: string, curr?: string) => void
  onDelete: () => void
  batchMode?: boolean
  isSelected?: boolean
  onSelectionChange?: () => void
}

export const ProfileItem = (props: Props) => {
  const {
    id,
    selected,
    activating,
    itemData,
    mutateProfiles,
    onSelect,
    onEdit,
    onSave,
    onDelete,
    batchMode,
    isSelected,
    onSelectionChange,
  } = props
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
  })

  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const loadingCache = useLoadingCache()
  const setLoadingCache = useSetLoadingCache()

  // 新增状态：是否显示下次更新时间
  const [showNextUpdate, setShowNextUpdate] = useState(false)
  const showNextUpdateRef = useRef(false)
  const [nextUpdateTime, setNextUpdateTime] = useState('')
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const setLoading = useCallback(
    (loading: boolean) => {
      setLoadingCache((cache) => {
        const next = new Set(cache)
        if (loading) {
          next.add(itemData.uid)
        } else {
          next.delete(itemData.uid)
        }
        return next
      })
    },
    [itemData.uid, setLoadingCache],
  )

  const { uid, name = 'Profile', extra, updated = 0, option } = itemData

  // 获取下次更新时间的函数
  const fetchNextUpdateTime = useLockFn(async (forceRefresh = false) => {
    if (
      itemData.option?.update_interval &&
      itemData.option.update_interval > 0
    ) {
      try {
        debugLog(`尝试获取配置 ${itemData.uid} 的下次更新时间`)

        // 如果需要强制刷新，先触发Timer.refresh()
        if (forceRefresh) {
          // 这里可以通过一个新的API来触发刷新，但目前我们依赖patch_profile中的刷新
          debugLog(`强制刷新定时器任务`)
        }

        const nextUpdate = await getNextUpdateTime(itemData.uid)
        debugLog(`获取到下次更新时间结果:`, nextUpdate)

        if (nextUpdate) {
          const nextUpdateDate = dayjs(nextUpdate * 1000)
          const now = dayjs()

          // 如果已经过期，显示"更新失败"
          if (nextUpdateDate.isBefore(now)) {
            setNextUpdateTime(
              t('profiles.components.profileItem.status.lastUpdateFailed'),
            )
          } else {
            // 否则显示剩余时间
            const diffMinutes = nextUpdateDate.diff(now, 'minute')

            if (diffMinutes < 60) {
              if (diffMinutes <= 0) {
                setNextUpdateTime(
                  `${t('profiles.components.profileItem.status.nextUp')} <1m`,
                )
              } else {
                setNextUpdateTime(
                  `${t('profiles.components.profileItem.status.nextUp')} ${diffMinutes}m`,
                )
              }
            } else {
              const hours = Math.floor(diffMinutes / 60)
              const mins = diffMinutes % 60
              setNextUpdateTime(
                `${t('profiles.components.profileItem.status.nextUp')} ${hours}h ${mins}m`,
              )
            }
          }
        } else {
          debugLog(`返回的下次更新时间为空`)
          setNextUpdateTime(
            t('profiles.components.profileItem.status.noSchedule'),
          )
        }
      } catch (err) {
        console.error(`获取下次更新时间出错:`, err)
        setNextUpdateTime(t('profiles.components.profileItem.status.unknown'))
      }
    } else {
      debugLog(`该配置未设置更新间隔或间隔为0`)
      setNextUpdateTime(
        t('profiles.components.profileItem.status.autoUpdateDisabled'),
      )
    }
  })

  // 切换显示模式的函数
  const toggleUpdateTimeDisplay = (e: React.MouseEvent) => {
    e.stopPropagation()

    if (!showNextUpdate) {
      fetchNextUpdateTime()
    }

    setShowNextUpdate(!showNextUpdate)
  }

  useEffect(() => {
    showNextUpdateRef.current = showNextUpdate
  }, [showNextUpdate])

  // 当组件加载或更新间隔变化时更新下次更新时间
  useEffect(() => {
    if (showNextUpdate) {
      fetchNextUpdateTime()
    }
  }, [
    fetchNextUpdateTime,
    showNextUpdate,
    itemData.option?.update_interval,
    updated,
  ])

  // 订阅定时器更新事件
  useEffect(() => {
    let disposed = false
    let unlistenTimerUpdate: (() => void) | undefined

    listen<string>('verge://timer-updated', ({ payload: updatedUid }) => {
      // 只有当更新的是当前配置时才刷新显示
      if (updatedUid === itemData.uid && showNextUpdateRef.current) {
        debugLog(`收到定时器更新事件: uid=${updatedUid}`)
        if (refreshTimeoutRef.current !== undefined) {
          clearTimeout(refreshTimeoutRef.current)
        }
        refreshTimeoutRef.current = window.setTimeout(() => {
          fetchNextUpdateTime(true)
        }, 1000)
      }
    })
      .then((unlisten) => {
        if (disposed) {
          unlisten()
          return
        }
        unlistenTimerUpdate = unlisten
      })
      .catch(console.error)

    return () => {
      disposed = true
      if (refreshTimeoutRef.current !== undefined) {
        clearTimeout(refreshTimeoutRef.current)
      }
      unlistenTimerUpdate?.()
    }
  }, [fetchNextUpdateTime, itemData.uid])

  // local file mode
  // remote file mode
  // remote file mode
  const hasUrl = !!itemData.url
  const hasExtra = !!extra // only subscription url has extra info
  const hasHome = !!itemData.home // only subscription url has home page

  const { upload = 0, download = 0, total = 0 } = extra ?? {}
  const from = parseUrl(itemData.url)
  const description = itemData.desc
  const profileFormat = itemData.profile_format === 'conf' ? 'conf' : 'yaml'
  const effectiveFile = itemData.effective_file ?? itemData.file ?? ''
  const secondaryInfo = [effectiveFile, description || (hasUrl ? from : '')]
    .filter(Boolean)
    .join(' · ')
  const expire = parseExpire(extra?.expire)
  const progress = Math.min(
    Math.round(((download + upload) * 100) / (total + 0.01)) + 1,
    100,
  )

  const loading = loadingCache.has(itemData.uid)

  // interval update fromNow field
  const [, forceRefresh] = useReducer((value: number) => value + 1, 0)
  useEffect(() => {
    if (!hasUrl) return

    let timer: ReturnType<typeof setTimeout> | undefined

    const handler = () => {
      const now = Date.now()
      const lastUpdate = updated * 1000
      // 大于一天的不管
      if (now - lastUpdate >= 24 * 36e5) return

      const wait = now - lastUpdate >= 36e5 ? 30e5 : 5e4

      timer = setTimeout(() => {
        forceRefresh()
        handler()
      }, wait)
    }

    handler()

    return () => {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
    }
  }, [forceRefresh, hasUrl, updated])

  const [fileOpen, setFileOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [proxiesOpen, setProxiesOpen] = useState(false)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [scriptOpen, setScriptOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confOverwriteConfirmOpen, setConfOverwriteConfirmOpen] =
    useState(false)
  const [qrOpen, setQrOpen] = useState(false)

  const loadProfileDocument = useCallback(() => readProfileFile(uid), [uid])
  const loadMergeDocument = useCallback(
    () => readProfileFile(option?.merge ?? ''),
    [option?.merge],
  )
  const loadScriptDocument = useCallback(
    () => readProfileFile(option?.script ?? ''),
    [option?.script],
  )

  const profileDocument = useEditorDocument({
    open: fileOpen,
    load: loadProfileDocument,
  })
  const mergeDocument = useEditorDocument({
    open: mergeOpen,
    load: loadMergeDocument,
  })
  const scriptDocument = useEditorDocument({
    open: scriptOpen,
    load: loadScriptDocument,
  })

  const onOpenHome = () => {
    setMenuOpen(false)
    open(itemData.home ?? '')
  }

  const onEditInfo = () => {
    setMenuOpen(false)
    onEdit()
  }

  const onShareQrCode = () => {
    setMenuOpen(false)
    setQrOpen(true)
  }

  const onEditFile = () => {
    setMenuOpen(false)
    setFileOpen(true)
  }

  const onEditRules = () => {
    setMenuOpen(false)
    setRulesOpen(true)
  }

  const onEditProxies = () => {
    setMenuOpen(false)
    setProxiesOpen(true)
  }

  const onEditGroups = () => {
    setMenuOpen(false)
    setGroupsOpen(true)
  }

  const onEditMerge = () => {
    setMenuOpen(false)
    setMergeOpen(true)
  }

  const onEditScript = () => {
    setMenuOpen(false)
    setScriptOpen(true)
  }

  const onForceSelect = () => {
    setMenuOpen(false)
    onSelect(true)
  }

  const onOpenFile = useLockFn(async () => {
    setMenuOpen(false)
    try {
      await viewProfile(itemData.uid)
    } catch (err) {
      showNotice.error(err)
    }
  })

  const onRevealFile = useLockFn(async () => {
    setMenuOpen(false)
    try {
      await revealProfileFile(itemData.uid)
    } catch (err) {
      showNotice.error(err)
    }
  })

  const runConfConversion = useLockFn(async (force: boolean) => {
    setMenuOpen(false)
    setConfOverwriteConfirmOpen(false)
    setLoading(true)
    try {
      const result = await convertProfileToConf(itemData.uid, force)
      await mutateProfiles()
      showNotice.success(
        result.overwritten
          ? selected
            ? 'profiles.page.feedback.notifications.confRegeneratedAndApplied'
            : 'profiles.page.feedback.notifications.confRegenerated'
          : selected
            ? 'profiles.page.feedback.notifications.confConvertedAndApplied'
            : 'profiles.page.feedback.notifications.confConverted',
        {
          targetFile: result.target_file,
        },
      )
    } catch (err) {
      showNotice.error('profiles.page.feedback.errors.confConversionFailed', {
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setLoading(false)
    }
  })

  const onConvertToConf = () => {
    setMenuOpen(false)
    if (itemData.conf_override) {
      setConfOverwriteConfirmOpen(true)
      return
    }
    void runConfConversion(false)
  }

  /// 0 不使用任何代理
  /// 1 使用订阅好的代理
  /// 2 至少使用一个代理，根据订阅，如果没订阅，默认使用系统代理
  const onUpdate = useLockFn(async (type: 0 | 1 | 2): Promise<void> => {
    setMenuOpen(false)
    setLoading(true)

    // 根据类型设置初始更新选项
    const option: Partial<IProfileOption> = {}
    if (type === 0) {
      option.with_proxy = false
      option.self_proxy = false
    } else if (type === 2) {
      if (itemData.option?.self_proxy) {
        option.with_proxy = false
        option.self_proxy = true
      } else {
        option.with_proxy = true
        option.self_proxy = false
      }
    }

    try {
      // 调用后端更新（后端会自动处理回退逻辑）
      const payload = Object.keys(option).length > 0 ? option : undefined
      await updateProfile(itemData.uid, payload)

      // 更新成功，刷新列表
      void mutateProfiles()
    } catch {
      // 更新完全失败（包括后端的回退尝试）
      // 不需要做处理，后端会通过事件通知系统发送错误
    } finally {
      setLoading(false)
    }
  })

  type ContextMenuItem = {
    label: string
    handler: () => void
    disabled: boolean
  }

  const menuLabels: Record<string, TranslationKey> = {
    home: 'profiles.components.menu.home',
    select: 'profiles.components.menu.select',
    shareQrCode: 'profiles.components.menu.shareQrCode',
    editInfo: 'profiles.components.menu.editInfo',
    editFile: 'profiles.components.menu.editFile',
    convertToConf: 'profiles.components.menu.convertToConf',
    reconvertToConf: 'profiles.components.menu.reconvertToConf',
    editRules: 'profiles.components.menu.editRules',
    editProxies: 'profiles.components.menu.editProxies',
    editGroups: 'profiles.components.menu.editGroups',
    extendConfig: 'profiles.components.menu.extendConfig',
    extendScript: 'profiles.components.menu.extendScript',
    openFile: 'profiles.components.menu.openFile',
    revealInFinder: 'profiles.components.menu.revealInFinder',
    update: 'profiles.components.menu.update',
    updateViaProxy: 'profiles.components.menu.updateViaProxy',
    delete: 'shared.actions.delete',
  } as const

  const urlModeMenu: ContextMenuItem[] = [
    ...(hasHome
      ? [
          {
            label: menuLabels.home,
            handler: onOpenHome,
            disabled: false,
          } satisfies ContextMenuItem,
        ]
      : []),
    {
      label: menuLabels.select,
      handler: onForceSelect,
      disabled: false,
    },
    {
      label: menuLabels.shareQrCode,
      handler: onShareQrCode,
      disabled: false,
    },
    {
      label: menuLabels.editInfo,
      handler: onEditInfo,
      disabled: false,
    },
    {
      label: menuLabels.editFile,
      handler: onEditFile,
      disabled: false,
    },
    {
      label: itemData.conf_override
        ? menuLabels.reconvertToConf
        : menuLabels.convertToConf,
      handler: onConvertToConf,
      disabled: loading,
    },
    {
      label: menuLabels.editRules,
      handler: onEditRules,
      disabled: !option?.rules,
    },
    {
      label: menuLabels.editProxies,
      handler: onEditProxies,
      disabled: !option?.proxies,
    },
    {
      label: menuLabels.editGroups,
      handler: onEditGroups,
      disabled: !option?.groups,
    },
    {
      label: menuLabels.extendConfig,
      handler: onEditMerge,
      disabled: !option?.merge,
    },
    {
      label: menuLabels.extendScript,
      handler: onEditScript,
      disabled: !option?.script,
    },
    {
      label: menuLabels.openFile,
      handler: onOpenFile,
      disabled: false,
    },
    {
      label: menuLabels.revealInFinder,
      handler: onRevealFile,
      disabled: false,
    },
    {
      label: menuLabels.update,
      handler: () => onUpdate(0),
      disabled: false,
    },
    {
      label: menuLabels.updateViaProxy,
      handler: () => onUpdate(2),
      disabled: false,
    },
    {
      label: menuLabels.delete,
      handler: () => {
        setMenuOpen(false)
        if (batchMode) {
          // If in batch mode, just toggle selection instead of showing delete confirmation
          if (onSelectionChange) {
            onSelectionChange()
          }
        } else {
          setConfirmOpen(true)
        }
      },
      disabled: false,
    },
  ]
  const fileModeMenu: ContextMenuItem[] = [
    {
      label: menuLabels.select,
      handler: onForceSelect,
      disabled: false,
    },
    {
      label: menuLabels.editInfo,
      handler: onEditInfo,
      disabled: false,
    },
    {
      label: menuLabels.editFile,
      handler: onEditFile,
      disabled: false,
    },
    {
      label: itemData.conf_override
        ? menuLabels.reconvertToConf
        : menuLabels.convertToConf,
      handler: onConvertToConf,
      disabled: loading,
    },
    {
      label: menuLabels.editRules,
      handler: onEditRules,
      disabled: !option?.rules,
    },
    {
      label: menuLabels.editProxies,
      handler: onEditProxies,
      disabled: !option?.proxies,
    },
    {
      label: menuLabels.editGroups,
      handler: onEditGroups,
      disabled: !option?.groups,
    },
    {
      label: menuLabels.extendConfig,
      handler: onEditMerge,
      disabled: !option?.merge,
    },
    {
      label: menuLabels.extendScript,
      handler: onEditScript,
      disabled: !option?.script,
    },
    {
      label: menuLabels.openFile,
      handler: onOpenFile,
      disabled: false,
    },
    {
      label: menuLabels.revealInFinder,
      handler: onRevealFile,
      disabled: false,
    },
    {
      label: menuLabels.delete,
      handler: () => {
        setMenuOpen(false)
        if (batchMode) {
          // If in batch mode, just toggle selection instead of showing delete confirmation
          if (onSelectionChange) {
            onSelectionChange()
          }
        } else {
          setConfirmOpen(true)
        }
      },
      disabled: false,
    },
  ]

  // 监听自动更新事件
  useEffect(() => {
    let disposed = false
    let unlisteners: Array<() => void> = []

    Promise.allSettled([
      listen<{ uid?: string }>('profile-update-started', ({ payload }) => {
        if (payload.uid === itemData.uid) {
          setLoading(true)
        }
      }),
      listen<{ uid?: string }>('profile-update-completed', ({ payload }) => {
        if (payload.uid !== itemData.uid) {
          return
        }

        setLoading(false)
        // 刷新 profile 数据以获取最新的 updated 时间戳
        void mutateProfiles()
        // 更新完成后刷新显示
        if (showNextUpdateRef.current) {
          fetchNextUpdateTime()
        }
      }),
    ]).then((results) => {
      const registeredUnlisteners = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      )

      if (disposed || results.some((result) => result.status === 'rejected')) {
        registeredUnlisteners.forEach((unlisten) => unlisten())
        results.forEach((result) => {
          if (result.status === 'rejected') console.error(result.reason)
        })
        return
      }

      unlisteners = registeredUnlisteners
    })

    return () => {
      disposed = true
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [fetchNextUpdateTime, itemData.uid, mutateProfiles, setLoading])

  const handleSaveProfileDocument = useLockFn(async () => {
    const currentValue = profileDocument.value
    if (!(await saveProfileFile(uid, currentValue))) {
      await profileDocument.reload()
      return
    }
    onSave?.(profileDocument.savedValue, currentValue)
    profileDocument.markSaved(currentValue)
  })

  const handleSaveMergeDocument = useLockFn(async () => {
    const mergeUid = option?.merge ?? ''
    const currentValue = mergeDocument.value
    if (!(await saveProfileFile(mergeUid, currentValue))) {
      await mergeDocument.reload()
      return
    }
    onSave?.(mergeDocument.savedValue, currentValue)
    mergeDocument.markSaved(currentValue)
  })

  const handleSaveScriptDocument = useLockFn(async () => {
    const scriptUid = option?.script ?? ''
    const currentValue = scriptDocument.value
    if (!(await saveProfileFile(scriptUid, currentValue))) {
      await scriptDocument.reload()
      return
    }
    onSave?.(scriptDocument.savedValue, currentValue)
    scriptDocument.markSaved(currentValue)
  })

  return (
    <div
      className="relative"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 'calc(infinity)' : undefined,
      }}
    >
      <ProfileBox
        aria-selected={selected}
        onClick={(e) => {
          // 如果正在激活中，阻止重复点击
          if (activating) {
            e.preventDefault()
            e.stopPropagation()
            return
          }
          onSelect(false)
        }}
        onContextMenu={(event) => {
          const { clientX, clientY } = event
          setPosition({ top: clientY, left: clientX })
          setMenuOpen(true)
          event.preventDefault()
        }}
      >
        {activating && (
          <div className="absolute top-[10px] right-[10px] bottom-[2px] left-[10px] z-10 flex items-center justify-center bg-black/10 backdrop-blur-[2px]">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
        <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-x-component">
          {batchMode && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={(event) => {
                event.stopPropagation()
                onSelectionChange?.()
              }}
            >
              {isSelected ? (
                <SquareCheck className="size-5 text-[var(--color-accent)]" />
              ) : (
                <Square className="size-5" />
              )}
            </Button>
          )}

          <div
            ref={setNodeRef}
            className="flex cursor-grab text-[var(--color-text-secondary)]"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-5" />
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-compact">
              <h2
                title={`${name}${effectiveFile ? `\n${effectiveFile}` : ''}`}
                className="min-w-0 truncate text-sm leading-[1.35] font-[550]"
              >
                {name}
              </h2>
              {itemData.conf_override && (
                <Badge
                  variant="outline"
                  className="h-5 shrink-0 text-[10px] font-normal"
                >
                  CONF Override
                </Badge>
              )}
            </div>
            <p
              title={secondaryInfo || undefined}
              className={cn(
                'mt-adjust truncate text-[11.5px] leading-[1.4] text-[var(--color-text-secondary)]',
                effectiveFile && 'font-mono',
              )}
            >
              {secondaryInfo}
            </p>
          </div>

          <div className="min-w-[150px] text-right text-[var(--color-text-secondary)] max-[680px]:hidden">
            {hasExtra && (
              <p className="text-[11.5px] leading-[1.4]">
                {parseTraffic(upload + download)} / {parseTraffic(total)} ·{' '}
                {expire}
              </p>
            )}
            {hasUrl ? (
              <button
                type="button"
                title={
                  showNextUpdate
                    ? t('profiles.components.profileItem.tooltips.showLast')
                    : `${t('shared.labels.updateTime')}: ${parseExpire(updated)}\n${t('profiles.components.profileItem.tooltips.showNext')}`
                }
                onClick={toggleUpdateTimeDisplay}
                className="cursor-pointer border-0 bg-transparent p-0 text-[11.5px] text-inherit [font-family:inherit]"
              >
                {showNextUpdate
                  ? nextUpdateTime
                  : updated > 0
                    ? dayjs(updated * 1000).fromNow()
                    : parseExpire(updated)}
              </button>
            ) : (
              <p className="text-[11.5px]">{parseExpire(updated)}</p>
            )}
          </div>

          <div className="flex items-center">
            {hasUrl && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title={t('shared.actions.refresh')}
                disabled={loading}
                className="text-[var(--color-text-secondary)]"
                onClick={(event) => {
                  event.stopPropagation()
                  if (!activating && !loading) onUpdate(1)
                }}
              >
                <RefreshCw
                  className={cn('size-5', loading && 'animate-spin')}
                />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title={t('shared.actions.showDetails')}
              disabled={loading}
              className="text-[var(--color-text-secondary)]"
              onClick={(event) => {
                event.stopPropagation()
                const rect = event.currentTarget.getBoundingClientRect()
                setPosition({ top: rect.bottom, left: rect.right })
                setMenuOpen(true)
              }}
            >
              {loading && !hasUrl ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Ellipsis className="size-5" />
              )}
            </Button>
          </div>
        </div>
        <div
          className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-[var(--color-accent-subtle)]"
          style={{ opacity: total > 0 ? 0.7 : 0 }}
        >
          <div
            className="h-full bg-[var(--color-accent)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </ProfileBox>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden
            className="pointer-events-none fixed"
            style={{
              top: position.top,
              left: position.left,
              width: 0,
              height: 0,
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-[120px]"
          onContextMenu={(e) => {
            setMenuOpen(false)
            e.preventDefault()
          }}
        >
          {(hasUrl ? urlModeMenu : fileModeMenu).map((item) => (
            <DropdownMenuItem
              key={item.label}
              disabled={item.disabled}
              variant={
                item.label === menuLabels.delete ? 'destructive' : 'default'
              }
              onSelect={() => item.handler()}
            >
              {t(item.label)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {fileOpen && (
        <EditorViewer
          open={true}
          value={profileDocument.value}
          language={profileFormat === 'conf' ? 'surge-conf' : 'yaml'}
          path={`profile:${effectiveFile || uid}`}
          loading={profileDocument.loading}
          dirty={profileDocument.dirty}
          onChange={profileDocument.setValue}
          onSave={handleSaveProfileDocument}
          onClose={() => setFileOpen(false)}
        />
      )}
      {rulesOpen && (
        <RulesEditorViewer
          groupsUid={option?.groups ?? ''}
          mergeUid={option?.merge ?? ''}
          profileUid={uid}
          profileFormat={profileFormat}
          property={option?.rules ?? ''}
          open={true}
          onSave={onSave}
          onClose={() => setRulesOpen(false)}
        />
      )}
      {proxiesOpen && (
        <ProxiesEditorViewer
          profileUid={uid}
          profileFormat={profileFormat}
          property={option?.proxies ?? ''}
          open={true}
          onSave={onSave}
          onClose={() => setProxiesOpen(false)}
        />
      )}
      {groupsOpen && (
        <GroupsEditorViewer
          mergeUid={option?.merge ?? ''}
          proxiesUid={option?.proxies ?? ''}
          profileUid={uid}
          profileFormat={profileFormat}
          property={option?.groups ?? ''}
          open={true}
          onSave={onSave}
          onClose={() => {
            setGroupsOpen(false)
          }}
        />
      )}
      {mergeOpen && (
        <EditorViewer
          open={true}
          value={mergeDocument.value}
          language="yaml"
          path={`merge:${option?.merge ?? ''}.yaml`}
          loading={mergeDocument.loading}
          dirty={mergeDocument.dirty}
          onChange={mergeDocument.setValue}
          onSave={handleSaveMergeDocument}
          onClose={() => setMergeOpen(false)}
        />
      )}
      {scriptOpen && (
        <EditorViewer
          open={true}
          value={scriptDocument.value}
          language="javascript"
          path={`script:${option?.script ?? ''}.js`}
          loading={scriptDocument.loading}
          dirty={scriptDocument.dirty}
          onChange={scriptDocument.setValue}
          onSave={handleSaveScriptDocument}
          onClose={() => setScriptOpen(false)}
        />
      )}

      <BaseDialog
        title={t('profiles.modals.confirmConfOverwrite.title')}
        open={confOverwriteConfirmOpen}
        okBtn={t('profiles.modals.confirmConfOverwrite.confirm')}
        cancelBtn={t('shared.actions.cancel')}
        contentSx={{ width: { xs: 320, sm: 440 }, userSelect: 'text' }}
        onCancel={() => setConfOverwriteConfirmOpen(false)}
        onClose={() => setConfOverwriteConfirmOpen(false)}
        onOk={() => void runConfConversion(true)}
      >
        <p className="text-sm break-words">
          {t('profiles.modals.confirmConfOverwrite.message', {
            file: effectiveFile,
          })}
        </p>
      </BaseDialog>

      <BaseDialog
        title={t('profiles.modals.confirmDelete.title')}
        open={confirmOpen}
        okBtn={t('shared.actions.confirm')}
        cancelBtn={t('shared.actions.cancel')}
        contentSx={{ width: { xs: 320, sm: 420 }, userSelect: 'text' }}
        onCancel={() => setConfirmOpen(false)}
        onClose={() => setConfirmOpen(false)}
        onOk={() => {
          onDelete()
          setConfirmOpen(false)
        }}
      >
        <p className="text-sm break-words">
          {t('profiles.modals.confirmDelete.message')}
        </p>
      </BaseDialog>
      {qrOpen && itemData.url && (
        <QrViewer
          open={true}
          value={`${itemData.url}${itemData.url.includes('?') ? '&' : '?'}name=${encodeURIComponent(name)}`}
          onClose={() => setQrOpen(false)}
        />
      )}
    </div>
  )
}

function parseUrl(url?: string) {
  if (!url) return ''
  const regex = /https?:\/\/(.+?)\//
  const result = url.match(regex)
  return result ? result[1] : 'local file'
}

function parseExpire(expire?: number) {
  if (!expire) return '-'
  return dayjs(expire * 1000).format('YYYY-MM-DD')
}
