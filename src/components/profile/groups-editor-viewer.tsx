import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { useLockFn } from 'ahooks'
import {
  cancelIdleCallback,
  requestIdleCallback,
} from 'foxact/request-idle-callback'
import yaml from 'js-yaml'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  ChevronDown,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import {
  type ReactNode,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  BaseDialog,
  BaseSearchBox,
  MonacoEditor,
  Switch,
  VirtualList,
} from '@/components/base'
import { GroupItem } from '@/components/profile/group-item'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  getNetworkInterfaces,
  readProfileFile,
  saveProfileFile,
} from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import {
  type ProfileFormat,
  parseProfileContent,
} from '@/services/profile-format'
import type { TranslationKey } from '@/types/generated/i18n-keys'
import type { MonacoEditorInstance } from '@/types/monaco'
import getSystem from '@/utils/get-system'

interface Props {
  proxiesUid: string
  mergeUid: string
  profileUid: string
  profileFormat: ProfileFormat
  property: string
  open: boolean
  onClose: () => void
  onSave?: (prev?: string, curr?: string) => void
}

const FIELD_WIDTH = 'w-[calc(100%-150px)] shrink-0'

const Item = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center px-adjust py-[5px]">{children}</div>
)

const FieldLabel = ({ children }: { children: ReactNode }) => (
  <div className="min-w-0 flex-1 truncate pr-component">{children}</div>
)

function MultiSelect({
  options,
  value,
  onChange,
  getOptionLabel,
}: {
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
  getOptionLabel?: (option: string) => string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const label = getOptionLabel ?? ((option: string) => option)
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = normalizedQuery
    ? options.filter((option) =>
        label(option).toLowerCase().includes(normalizedQuery),
      )
    : options
  const toggle = (option: string) => {
    onChange(
      value.includes(option)
        ? value.filter((item) => item !== option)
        : [...value, option],
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 items-center justify-between gap-inline rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-transparent px-stack text-left text-sm outline-none focus-visible:border-[var(--color-focus-ring)]',
            FIELD_WIDTH,
          )}
        >
          <span
            className={cn(
              'truncate',
              value.length === 0 && 'text-[var(--color-text-muted)]',
            )}
          >
            {value.length > 0 ? value.map(label).join(', ') : ''}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <div className="p-compact">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-compact pt-0">
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className="flex w-full items-center gap-component rounded-[var(--radius-compact)] px-compact py-inline text-left text-sm hover:bg-[var(--color-bg-hover)]"
            >
              <Check
                className={cn(
                  'size-4 shrink-0',
                  value.includes(option) ? 'opacity-100' : 'opacity-0',
                )}
              />
              <span className="truncate">{label(option)}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-compact py-inline text-sm text-[var(--color-text-muted)]">
              {t('shared.statuses.empty')}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

const builtinProxyPolicies = ['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS']

const PROXY_STRATEGY_LABEL_KEYS: Record<string, TranslationKey> = {
  select: 'proxies.components.enums.strategies.select',
  'url-test': 'proxies.components.enums.strategies.url-test',
  fallback: 'proxies.components.enums.strategies.fallback',
  'load-balance': 'proxies.components.enums.strategies.load-balance',
  relay: 'proxies.components.enums.strategies.relay',
}

const PROXY_POLICY_LABEL_KEYS: Record<string, TranslationKey> =
  builtinProxyPolicies.reduce(
    (acc, policy) => {
      acc[policy] =
        `proxies.components.enums.policies.${policy}` as TranslationKey
      return acc
    },
    {} as Record<string, TranslationKey>,
  )

const normalizeDeleteSeq = (input?: unknown): string[] => {
  if (!Array.isArray(input)) {
    return []
  }

  const names = input
    .map((item) => {
      if (typeof item === 'string') {
        return item
      }

      if (
        item &&
        typeof item === 'object' &&
        'name' in item &&
        typeof (item as { name: unknown }).name === 'string'
      ) {
        return (item as { name: string }).name
      }

      return undefined
    })
    .filter(
      (name): name is string => typeof name === 'string' && name.length > 0,
    )

  return Array.from(new Set(names))
}

const buildGroupsYaml = (
  prepend: IProxyGroupConfig[],
  append: IProxyGroupConfig[],
  deleteList: string[],
) => {
  return yaml.dump(
    {
      prepend,
      append,
      delete: deleteList,
    },
    { forceQuotes: true },
  )
}

export const GroupsEditorViewer = (props: Props) => {
  const {
    mergeUid,
    proxiesUid,
    profileUid,
    profileFormat,
    property,
    open,
    onClose,
    onSave,
  } = props
  const { t } = useTranslation()
  const translateStrategy = useCallback(
    (value: string) =>
      PROXY_STRATEGY_LABEL_KEYS[value]
        ? t(PROXY_STRATEGY_LABEL_KEYS[value])
        : value,
    [t],
  )
  const translatePolicy = useCallback(
    (value: string) =>
      PROXY_POLICY_LABEL_KEYS[value]
        ? t(PROXY_POLICY_LABEL_KEYS[value])
        : value,
    [t],
  )
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const editorRef = useRef<MonacoEditorInstance | null>(null)
  const [prevData, setPrevData] = useState('')
  const [currData, setCurrData] = useState('')
  const [visualization, setVisualization] = useState(true)
  const [match, setMatch] = useState(() => (_: string) => true)
  const [interfaceNameList, setInterfaceNameList] = useState<string[]>([])
  const { control, ...formIns } = useForm<IProxyGroupConfig>({
    defaultValues: {
      type: 'select',
      name: '',
      interval: 300,
      timeout: 5000,
      'max-failed-times': 5,
      lazy: true,
    },
  })
  const [groupList, setGroupList] = useState<IProxyGroupConfig[]>([])
  const [proxyPolicyList, setProxyPolicyList] = useState<string[]>([])
  const [proxyProviderList, setProxyProviderList] = useState<string[]>([])
  const [prependSeq, setPrependSeq] = useState<IProxyGroupConfig[]>([])
  const [appendSeq, setAppendSeq] = useState<IProxyGroupConfig[]>([])
  const [deleteSeq, setDeleteSeq] = useState<string[]>([])

  const filteredPrependSeq = useMemo(
    () => prependSeq.filter((group) => match(group.name)),
    [prependSeq, match],
  )
  const filteredGroupList = useMemo(
    () => groupList.filter((group) => match(group.name)),
    [groupList, match],
  )
  const filteredAppendSeq = useMemo(
    () => appendSeq.filter((group) => match(group.name)),
    [appendSeq, match],
  )

  const renderItem = (index: number): React.ReactNode => {
    const shift = filteredPrependSeq.length > 0 ? 1 : 0
    if (filteredPrependSeq.length > 0 && index === 0) {
      return (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onPrependDragEnd}
        >
          <SortableContext
            items={filteredPrependSeq.map((x) => {
              return x.name
            })}
          >
            {filteredPrependSeq.map((item) => {
              return (
                <GroupItem
                  key={item.name}
                  type="prepend"
                  group={item}
                  onDelete={() => {
                    setPrependSeq(
                      prependSeq.filter((v) => v.name !== item.name),
                    )
                  }}
                />
              )
            })}
          </SortableContext>
        </DndContext>
      )
    } else if (index < filteredGroupList.length + shift) {
      const newIndex = index - shift
      return (
        <GroupItem
          key={filteredGroupList[newIndex].name}
          type={
            deleteSeq.includes(filteredGroupList[newIndex].name)
              ? 'delete'
              : 'original'
          }
          group={filteredGroupList[newIndex]}
          onDelete={() => {
            if (deleteSeq.includes(filteredGroupList[newIndex].name)) {
              setDeleteSeq(
                deleteSeq.filter((v) => v !== filteredGroupList[newIndex].name),
              )
            } else {
              setDeleteSeq((prev) => [
                ...prev,
                filteredGroupList[newIndex].name,
              ])
            }
          }}
        />
      )
    } else {
      return (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onAppendDragEnd}
        >
          <SortableContext
            items={filteredAppendSeq.map((x) => {
              return x.name
            })}
          >
            {filteredAppendSeq.map((item) => {
              return (
                <GroupItem
                  key={item.name}
                  type="append"
                  group={item}
                  onDelete={() => {
                    setAppendSeq(appendSeq.filter((v) => v.name !== item.name))
                  }}
                />
              )
            })}
          </SortableContext>
        </DndContext>
      )
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const onPrependDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over) {
      if (active.id !== over.id) {
        let activeIndex = 0
        let overIndex = 0
        prependSeq.forEach((item, index) => {
          if (item.name === active.id) {
            activeIndex = index
          }
          if (item.name === over.id) {
            overIndex = index
          }
        })

        setPrependSeq(arrayMove(prependSeq, activeIndex, overIndex))
      }
    }
  }
  const onAppendDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over) {
      if (active.id !== over.id) {
        let activeIndex = 0
        let overIndex = 0
        appendSeq.forEach((item, index) => {
          if (item.name === active.id) {
            activeIndex = index
          }
          if (item.name === over.id) {
            overIndex = index
          }
        })
        setAppendSeq(arrayMove(appendSeq, activeIndex, overIndex))
      }
    }
  }
  const fetchContent = useCallback(async () => {
    const data = await readProfileFile(property)
    const obj = yaml.load(data) as ISeqProfileConfig | null

    setPrependSeq(obj?.prepend || [])
    setAppendSeq(obj?.append || [])
    setDeleteSeq((prev) => {
      const normalized = normalizeDeleteSeq(obj?.delete)
      if (
        normalized.length === prev.length &&
        normalized.every((item, index) => item === prev[index])
      ) {
        return prev
      }
      return normalized
    })

    setPrevData(data)
    setCurrData(data)
  }, [property])

  useEffect(() => {
    if (currData === '' || visualization !== true) {
      return
    }

    const obj = yaml.load(currData) as ISeqProfileConfig | null
    startTransition(() => {
      setPrependSeq(obj?.prepend ?? [])
      setAppendSeq(obj?.append ?? [])
      setDeleteSeq((prev) => {
        const normalized = normalizeDeleteSeq(obj?.delete)
        if (
          normalized.length === prev.length &&
          normalized.every((item, index) => item === prev[index])
        ) {
          return prev
        }
        return normalized
      })
    })
  }, [currData, visualization])

  // 优化：异步处理大数据yaml.dump，避免UI卡死
  useEffect(() => {
    if (prependSeq && appendSeq && deleteSeq) {
      const serialize = () => {
        try {
          setCurrData(buildGroupsYaml(prependSeq, appendSeq, deleteSeq))
        } catch (e) {
          console.warn('[GroupsEditorViewer] yaml.dump failed:', e)
          // 防止异常导致UI卡死
        }
      }

      const handle = requestIdleCallback(serialize)
      return () => {
        cancelIdleCallback(handle)
      }
    }
  }, [prependSeq, appendSeq, deleteSeq])

  const fetchProxyPolicy = useCallback(async () => {
    const data = await readProfileFile(profileUid)
    const proxiesData = await readProfileFile(proxiesUid)
    const originGroupsObj = parseProfileContent(data, profileFormat) as {
      'proxy-groups': IProxyGroupConfig[]
    } | null

    const originProxiesObj = parseProfileContent(data, profileFormat) as {
      proxies: []
    } | null
    const originProxies = originProxiesObj?.proxies || []
    const moreProxiesObj = yaml.load(proxiesData) as ISeqProfileConfig | null
    const morePrependProxies = moreProxiesObj?.prepend || []
    const moreAppendProxies = moreProxiesObj?.append || []
    const moreDeleteProxies = normalizeDeleteSeq(moreProxiesObj?.delete)

    const proxies = morePrependProxies.concat(
      originProxies.filter((proxy: any) => {
        const proxyName =
          typeof proxy === 'string'
            ? proxy
            : (proxy?.name as string | undefined)
        return proxyName ? !moreDeleteProxies.includes(proxyName) : true
      }),
      moreAppendProxies,
    )

    const proxyNames = proxies
      .map((proxy: any) =>
        typeof proxy === 'string' ? proxy : (proxy?.name as string | undefined),
      )
      .filter(
        (name): name is string => typeof name === 'string' && name.length > 0,
      )

    const computedPolicyList = builtinProxyPolicies.concat(
      prependSeq.map((group: IProxyGroupConfig) => group.name),
      (originGroupsObj?.['proxy-groups'] || [])
        .map((group: IProxyGroupConfig) => group.name)
        .filter((name) => !deleteSeq.includes(name)),
      appendSeq.map((group: IProxyGroupConfig) => group.name),
      proxyNames,
    )

    setProxyPolicyList(Array.from(new Set(computedPolicyList)))
  }, [appendSeq, deleteSeq, prependSeq, profileFormat, profileUid, proxiesUid])
  const fetchProfile = useCallback(async () => {
    const data = await readProfileFile(profileUid)
    const mergeData = await readProfileFile(mergeUid)
    const globalMergeData = await readProfileFile('Merge')

    const originGroupsObj = parseProfileContent(data, profileFormat) as {
      'proxy-groups': IProxyGroupConfig[]
    } | null

    const originProviderObj = parseProfileContent(data, profileFormat) as {
      'proxy-providers': Record<string, unknown>
    } | null
    const originProvider = originProviderObj?.['proxy-providers'] || {}

    const moreProviderObj = yaml.load(mergeData) as {
      'proxy-providers': Record<string, unknown>
    } | null
    const moreProvider = moreProviderObj?.['proxy-providers'] || {}

    const globalProviderObj = yaml.load(globalMergeData) as {
      'proxy-providers': Record<string, unknown>
    } | null
    const globalProvider = globalProviderObj?.['proxy-providers'] || {}

    const provider = Object.assign(
      {},
      originProvider,
      moreProvider,
      globalProvider,
    )

    setProxyProviderList(Object.keys(provider))
    setGroupList(originGroupsObj?.['proxy-groups'] || [])
  }, [mergeUid, profileFormat, profileUid])
  const getInterfaceNameList = useCallback(async () => {
    const list = await getNetworkInterfaces()
    setInterfaceNameList(list)
  }, [])
  useEffect(() => {
    if (!open) return
    fetchProxyPolicy()
  }, [fetchProxyPolicy, open])

  useEffect(() => {
    if (!open) return
    fetchContent()
    fetchProfile()
    getInterfaceNameList()
  }, [fetchContent, fetchProfile, getInterfaceNameList, open])

  useEffect(() => {
    return () => {
      editorRef.current?.dispose()
      editorRef.current = null
    }
  }, [])

  const validateGroup = () => {
    const group = formIns.getValues()
    if (group.name === '') {
      throw new Error(t('profiles.modals.groupsEditor.errors.nameRequired'))
    }
  }

  const handleSave = useLockFn(async () => {
    try {
      const nextData = visualization
        ? buildGroupsYaml(prependSeq, appendSeq, deleteSeq)
        : currData

      if (visualization) {
        setCurrData(nextData)
      }

      if (!(await saveProfileFile(property, nextData))) {
        await fetchContent()
        onClose()
        return
      }
      showNotice.success('shared.feedback.notifications.saved')
      setPrevData(nextData)
      onSave?.(prevData, nextData)
      onClose()
    } catch (err) {
      showNotice.error(err)
    }
  })

  return (
    <BaseDialog
      open={open}
      title={
        <div className="flex items-center justify-between pr-8">
          {t('profiles.modals.groupsEditor.title')}
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setVisualization((prev) => !prev)
            }}
          >
            {visualization
              ? t('shared.editorModes.advanced')
              : t('shared.editorModes.visualization')}
          </Button>
        </div>
      }
      disableEnforceFocus={!visualization}
      disableFooter
      contentSx={{ width: 'calc(100vw - 4rem)', maxWidth: 1400 }}
      onClose={onClose}
    >
      <div className="flex h-[calc(100vh-185px)]">
        {visualization ? (
          <>
            <div className="w-1/2 px-component">
              <div className="h-[calc(100%-80px)] overflow-y-auto">
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t('profiles.modals.groupsEditor.fields.type')}
                      </FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className={FIELD_WIDTH}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            'select',
                            'url-test',
                            'fallback',
                            'load-balance',
                            'relay',
                          ].map((option) => (
                            <SelectItem key={option} value={option}>
                              {translateStrategy(option)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Item>
                  )}
                />
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t('profiles.modals.groupsEditor.fields.name')}
                      </FieldLabel>
                      <Input
                        autoComplete="new-password"
                        className={FIELD_WIDTH}
                        required
                        aria-invalid={field.value === ''}
                        {...field}
                      />
                    </Item>
                  )}
                />
                <Controller
                  name="icon"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t('profiles.modals.groupsEditor.fields.icon')}
                      </FieldLabel>
                      <Input
                        autoComplete="new-password"
                        className={FIELD_WIDTH}
                        {...field}
                      />
                    </Item>
                  )}
                />
                <Controller
                  name="proxies"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t('profiles.modals.groupsEditor.fields.proxies')}
                      </FieldLabel>
                      <MultiSelect
                        options={proxyPolicyList}
                        value={field.value ?? []}
                        onChange={field.onChange}
                        getOptionLabel={translatePolicy}
                      />
                    </Item>
                  )}
                />
                <Controller
                  name="use"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t('profiles.modals.groupsEditor.fields.provider')}
                      </FieldLabel>
                      <MultiSelect
                        options={proxyProviderList}
                        value={field.value ?? []}
                        onChange={field.onChange}
                      />
                    </Item>
                  )}
                />
                <Controller
                  name="url"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t(
                          'profiles.modals.groupsEditor.fields.healthCheckUrl',
                        )}
                      </FieldLabel>
                      <Input
                        autoComplete="new-password"
                        placeholder="http://cp.cloudflare.com/generate_204"
                        className={FIELD_WIDTH}
                        {...field}
                      />
                    </Item>
                  )}
                />
                <Controller
                  name="expected-status"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t(
                          'profiles.modals.groupsEditor.fields.expectedStatus',
                        )}
                      </FieldLabel>
                      <Input
                        autoComplete="new-password"
                        placeholder="*"
                        className={FIELD_WIDTH}
                        onChange={(e) => {
                          field.onChange(parseInt(e.target.value))
                        }}
                      />
                    </Item>
                  )}
                />
                <Controller
                  name="interval"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t('profiles.modals.groupsEditor.fields.interval')}
                      </FieldLabel>
                      <div
                        className={cn(
                          'flex items-center gap-inline',
                          FIELD_WIDTH,
                        )}
                      >
                        <Input
                          autoComplete="new-password"
                          placeholder="300"
                          type="number"
                          className="min-w-0 flex-1"
                          onChange={(e) => {
                            field.onChange(parseInt(e.target.value))
                          }}
                        />
                        <span className="shrink-0 text-sm text-[var(--color-text-muted)]">
                          {t('shared.units.seconds')}
                        </span>
                      </div>
                    </Item>
                  )}
                />
                <Controller
                  name="timeout"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>{t('shared.labels.timeout')}</FieldLabel>
                      <div
                        className={cn(
                          'flex items-center gap-inline',
                          FIELD_WIDTH,
                        )}
                      >
                        <Input
                          autoComplete="new-password"
                          placeholder="5000"
                          type="number"
                          className="min-w-0 flex-1"
                          onChange={(e) => {
                            field.onChange(parseInt(e.target.value))
                          }}
                        />
                        <span className="shrink-0 text-sm text-[var(--color-text-muted)]">
                          {t('shared.units.milliseconds')}
                        </span>
                      </div>
                    </Item>
                  )}
                />
                <Controller
                  name="max-failed-times"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t(
                          'profiles.modals.groupsEditor.fields.maxFailedTimes',
                        )}
                      </FieldLabel>
                      <Input
                        autoComplete="new-password"
                        placeholder="5"
                        type="number"
                        className={FIELD_WIDTH}
                        onChange={(e) => {
                          field.onChange(parseInt(e.target.value))
                        }}
                      />
                    </Item>
                  )}
                />
                <Controller
                  name="interface-name"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t('profiles.modals.groupsEditor.fields.interfaceName')}
                      </FieldLabel>
                      <Select
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className={FIELD_WIDTH}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(
                            new Set(
                              [field.value, ...interfaceNameList].filter(
                                (name): name is string => !!name,
                              ),
                            ),
                          ).map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Item>
                  )}
                />
                <Controller
                  name="routing-mark"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t('profiles.modals.groupsEditor.fields.routingMark')}
                      </FieldLabel>
                      <Input
                        autoComplete="new-password"
                        type="number"
                        className={FIELD_WIDTH}
                        onChange={(e) => {
                          field.onChange(parseInt(e.target.value))
                        }}
                      />
                    </Item>
                  )}
                />
                <Controller
                  name="filter"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t('profiles.modals.groupsEditor.fields.filter')}
                      </FieldLabel>
                      <Input
                        autoComplete="new-password"
                        className={FIELD_WIDTH}
                        {...field}
                      />
                    </Item>
                  )}
                />
                <Controller
                  name="exclude-filter"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t('profiles.modals.groupsEditor.fields.excludeFilter')}
                      </FieldLabel>
                      <Input
                        autoComplete="new-password"
                        className={FIELD_WIDTH}
                        {...field}
                      />
                    </Item>
                  )}
                />
                <Controller
                  name="exclude-type"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t('profiles.modals.groupsEditor.fields.excludeType')}
                      </FieldLabel>
                      <MultiSelect
                        options={[
                          'Direct',
                          'Reject',
                          'RejectDrop',
                          'Compatible',
                          'Pass',
                          'Dns',
                          'Shadowsocks',
                          'ShadowsocksR',
                          'Snell',
                          'Socks5',
                          'Http',
                          'Vmess',
                          'Vless',
                          'Trojan',
                          'Hysteria',
                          'Hysteria2',
                          'WireGuard',
                          'Tuic',
                          'Mieru',
                          'Masque',
                          'AnyTLS',
                          'Sudoku',
                          'Relay',
                          'Selector',
                          'Fallback',
                          'URLTest',
                          'LoadBalance',
                          'Ssh',
                        ]}
                        value={field.value ? field.value.split('|') : []}
                        onChange={(value) => {
                          field.onChange(value.join('|'))
                        }}
                      />
                    </Item>
                  )}
                />
                <Controller
                  name="include-all"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t('profiles.modals.groupsEditor.fields.includeAll')}
                      </FieldLabel>
                      <Switch
                        checked={!!field.value}
                        name={field.name}
                        onBlur={field.onBlur}
                        onCheckedChange={field.onChange}
                      />
                    </Item>
                  )}
                />
                <Controller
                  name="include-all-proxies"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t(
                          'profiles.modals.groupsEditor.fields.includeAllProxies',
                        )}
                      </FieldLabel>
                      <Switch
                        checked={!!field.value}
                        name={field.name}
                        onBlur={field.onBlur}
                        onCheckedChange={field.onChange}
                      />
                    </Item>
                  )}
                />
                <Controller
                  name="include-all-providers"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t(
                          'profiles.modals.groupsEditor.fields.includeAllProviders',
                        )}
                      </FieldLabel>
                      <Switch
                        checked={!!field.value}
                        name={field.name}
                        onBlur={field.onBlur}
                        onCheckedChange={field.onChange}
                      />
                    </Item>
                  )}
                />
                <Controller
                  name="lazy"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t('profiles.modals.groupsEditor.toggles.lazy')}
                      </FieldLabel>
                      <Switch
                        checked={!!field.value}
                        name={field.name}
                        onBlur={field.onBlur}
                        onCheckedChange={field.onChange}
                      />
                    </Item>
                  )}
                />
                <Controller
                  name="disable-udp"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t('profiles.modals.groupsEditor.toggles.disableUdp')}
                      </FieldLabel>
                      <Switch
                        checked={!!field.value}
                        name={field.name}
                        onBlur={field.onBlur}
                        onCheckedChange={field.onChange}
                      />
                    </Item>
                  )}
                />
                <Controller
                  name="hidden"
                  control={control}
                  render={({ field }) => (
                    <Item>
                      <FieldLabel>
                        {t('profiles.modals.groupsEditor.toggles.hidden')}
                      </FieldLabel>
                      <Switch
                        checked={!!field.value}
                        name={field.name}
                        onBlur={field.onBlur}
                        onCheckedChange={field.onChange}
                      />
                    </Item>
                  )}
                />
              </div>
              <Item>
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    try {
                      validateGroup()
                      for (const item of [...prependSeq, ...groupList]) {
                        if (item.name === formIns.getValues().name) {
                          throw new Error(
                            t('profiles.modals.groupsEditor.errors.nameExists'),
                          )
                        }
                      }
                      setPrependSeq([formIns.getValues(), ...prependSeq])
                    } catch (err) {
                      showNotice.error(err)
                    }
                  }}
                >
                  <ArrowUpToLine className="size-4" />
                  {t('profiles.modals.groupsEditor.actions.prepend')}
                </Button>
              </Item>
              <Item>
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    try {
                      validateGroup()
                      for (const item of [...appendSeq, ...groupList]) {
                        if (item.name === formIns.getValues().name) {
                          throw new Error(
                            t('profiles.modals.groupsEditor.errors.nameExists'),
                          )
                        }
                      }
                      setAppendSeq([...appendSeq, formIns.getValues()])
                    } catch (err) {
                      showNotice.error(err)
                    }
                  }}
                >
                  <ArrowDownToLine className="size-4" />
                  {t('profiles.modals.groupsEditor.actions.append')}
                </Button>
              </Item>
            </div>

            <div className="w-1/2 px-component">
              <BaseSearchBox onSearch={(match) => setMatch(() => match)} />
              <VirtualList
                count={
                  filteredGroupList.length +
                  (filteredPrependSeq.length > 0 ? 1 : 0) +
                  (filteredAppendSeq.length > 0 ? 1 : 0)
                }
                estimateSize={56}
                renderItem={renderItem}
                style={{ height: 'calc(100% - 24px)', marginTop: '8px' }}
              />
            </div>
          </>
        ) : (
          <MonacoEditor
            height="100%"
            language="yaml"
            value={currData}
            theme={isDark ? 'vs-dark' : 'light'}
            onMount={(editorInstance) => {
              editorRef.current = editorInstance
            }}
            options={{
              tabSize: 2, // 根据语言类型设置缩进大小
              minimap: {
                enabled: document.documentElement.clientWidth >= 1500, // 超过一定宽度显示minimap滚动条
              },
              mouseWheelZoom: true, // 按住Ctrl滚轮调节缩放比例
              quickSuggestions: {
                strings: true, // 字符串类型的建议
                comments: true, // 注释类型的建议
                other: true, // 其他类型的建议
              },
              padding: {
                top: 33, // 顶部padding防止遮挡snippets
              },
              fontFamily: `Fira Code, JetBrains Mono, Roboto Mono, "Source Code Pro", Consolas, Menlo, Monaco, monospace, "Courier New", "Apple Color Emoji"${
                getSystem() === 'windows' ? ', twemoji mozilla' : ''
              }`,
              fontLigatures: false, // 连字符
              smoothScrolling: true, // 平滑滚动
            }}
            onChange={(value) => setCurrData(value ?? '')}
          />
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t('shared.actions.cancel')}
        </Button>

        <Button onClick={handleSave}>{t('shared.actions.save')}</Button>
      </DialogFooter>
    </BaseDialog>
  )
}
