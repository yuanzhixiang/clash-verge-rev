import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useLockFn } from 'ahooks'
import yaml from 'js-yaml'
import { ArrowDownToLine, ArrowUpToLine } from 'lucide-react'
import { useTheme } from 'next-themes'
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import {
  BaseDialog,
  BaseSearchBox,
  MonacoEditor,
  Switch,
  VirtualList,
} from '@/components/base'
import { RuleItem } from '@/components/profile/rule-item'
import {
  BUILTIN_PROXY_POLICIES,
  PROXY_POLICY_LABEL_KEYS,
  RULE_DEFINITIONS,
  RULE_TYPE_LABEL_KEYS,
  RuleConfigError,
  serializeRule,
} from '@/components/rule/rule-config'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { readProfileFile, saveProfileFile } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import {
  type ProfileFormat,
  parseProfileContent,
} from '@/services/profile-format'
import type { MonacoEditorInstance } from '@/types/monaco'
import getSystem from '@/utils/get-system'

interface Props {
  groupsUid: string
  mergeUid: string
  profileUid: string
  profileFormat: ProfileFormat
  property: string
  open: boolean
  onClose: () => void
  onSave?: (prev?: string, curr?: string) => void
}

const rules = RULE_DEFINITIONS
const builtinProxyPolicies: string[] = [...BUILTIN_PROXY_POLICIES]

export const RulesEditorViewer = (props: Props) => {
  const {
    groupsUid,
    mergeUid,
    profileUid,
    profileFormat,
    property,
    open,
    onClose,
    onSave,
  } = props
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()

  const editorRef = useRef<MonacoEditorInstance | null>(null)

  const [prevData, setPrevData] = useState('')
  const [currData, setCurrData] = useState('')
  const [visualization, setVisualization] = useState(true)
  const [match, setMatch] = useState(() => (_: string) => true)

  const [ruleType, setRuleType] = useState<(typeof rules)[number]>(rules[0]!)
  const [ruleContent, setRuleContent] = useState('')
  const [noResolve, setNoResolve] = useState(false)
  const [proxyPolicy, setProxyPolicy] = useState(builtinProxyPolicies[0]!)
  const [proxyPolicyList, setProxyPolicyList] = useState<string[]>([])
  const [ruleList, setRuleList] = useState<string[]>([])
  const [ruleSetList, setRuleSetList] = useState<string[]>([])
  const [subRuleList, setSubRuleList] = useState<string[]>([])

  const [prependSeq, setPrependSeq] = useState<string[]>([])
  const [appendSeq, setAppendSeq] = useState<string[]>([])
  const [deleteSeq, setDeleteSeq] = useState<string[]>([])
  const [replaceSeq, setReplaceSeq] = useState<
    Array<{ from: string; to: string }>
  >([])
  const hasLoadedSeqConfigRef = useRef(false)

  const filteredPrependSeq = useMemo(
    () => prependSeq.filter((rule) => match(rule)),
    [prependSeq, match],
  )
  const filteredRuleList = useMemo(
    () => ruleList.filter((rule) => match(rule)),
    [ruleList, match],
  )
  const filteredAppendSeq = useMemo(
    () => appendSeq.filter((rule) => match(rule)),
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
              return x
            })}
          >
            {filteredPrependSeq.map((item) => {
              return (
                <RuleItem
                  key={item}
                  type="prepend"
                  ruleRaw={item}
                  onDelete={() => {
                    setPrependSeq(prependSeq.filter((v) => v !== item))
                  }}
                />
              )
            })}
          </SortableContext>
        </DndContext>
      )
    } else if (index < filteredRuleList.length + shift) {
      const newIndex = index - shift
      return (
        <RuleItem
          key={filteredRuleList[newIndex]}
          type={
            deleteSeq.includes(filteredRuleList[newIndex])
              ? 'delete'
              : 'original'
          }
          ruleRaw={filteredRuleList[newIndex]}
          onDelete={() => {
            if (deleteSeq.includes(filteredRuleList[newIndex])) {
              setDeleteSeq(
                deleteSeq.filter((v) => v !== filteredRuleList[newIndex]),
              )
            } else {
              setDeleteSeq((prev) => [...prev, filteredRuleList[newIndex]])
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
              return x
            })}
          >
            {filteredAppendSeq.map((item) => {
              return (
                <RuleItem
                  key={item}
                  type="append"
                  ruleRaw={item}
                  onDelete={() => {
                    setAppendSeq(appendSeq.filter((v) => v !== item))
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
  const reorder = (list: string[], startIndex: number, endIndex: number) => {
    const result = Array.from(list)
    const [removed] = result.splice(startIndex, 1)
    result.splice(endIndex, 0, removed)
    return result
  }
  const onPrependDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over) {
      if (active.id !== over.id) {
        const activeIndex = prependSeq.indexOf(active.id.toString())
        const overIndex = prependSeq.indexOf(over.id.toString())
        setPrependSeq(reorder(prependSeq, activeIndex, overIndex))
      }
    }
  }
  const onAppendDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over) {
      if (active.id !== over.id) {
        const activeIndex = appendSeq.indexOf(active.id.toString())
        const overIndex = appendSeq.indexOf(over.id.toString())
        setAppendSeq(reorder(appendSeq, activeIndex, overIndex))
      }
    }
  }
  const fetchContent = useCallback(async () => {
    hasLoadedSeqConfigRef.current = false
    const data = await readProfileFile(property)
    const obj = yaml.load(data) as ISeqProfileConfig | null

    setPrependSeq(obj?.prepend || [])
    setAppendSeq(obj?.append || [])
    setDeleteSeq(obj?.delete || [])
    setReplaceSeq(obj?.replace || [])

    setPrevData(data)
    setCurrData(data)
    hasLoadedSeqConfigRef.current = true
  }, [property])

  useEffect(() => {
    if (currData === '' || visualization !== true) {
      return
    }

    const obj = yaml.load(currData) as ISeqProfileConfig | null
    startTransition(() => {
      setPrependSeq(obj?.prepend ?? [])
      setAppendSeq(obj?.append ?? [])
      setDeleteSeq(obj?.delete ?? [])
      setReplaceSeq(obj?.replace ?? [])
    })
  }, [currData, visualization])

  // 优化：异步处理大数据yaml.dump，避免UI卡死
  useEffect(() => {
    if (!hasLoadedSeqConfigRef.current) {
      return
    }

    if (!(prependSeq && appendSeq && deleteSeq && replaceSeq)) {
      return
    }

    const serialize = () => {
      if (!hasLoadedSeqConfigRef.current) {
        return
      }

      try {
        setCurrData(
          yaml.dump(
            {
              prepend: prependSeq,
              append: appendSeq,
              delete: deleteSeq,
              replace: replaceSeq,
            },
            { forceQuotes: true },
          ),
        )
      } catch (error) {
        showNotice.error(error ?? 'YAML dump error')
      }
    }
    let idleId: number | undefined
    let timeoutId: number | undefined
    if (window.requestIdleCallback) {
      idleId = window.requestIdleCallback(serialize)
    } else {
      timeoutId = window.setTimeout(serialize, 0)
    }
    return () => {
      if (idleId !== undefined && window.cancelIdleCallback) {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
    }
  }, [prependSeq, appendSeq, deleteSeq, replaceSeq])

  const fetchProfile = useCallback(async () => {
    const data = await readProfileFile(profileUid) // 原配置文件
    const groupsData = await readProfileFile(groupsUid) // groups配置文件
    const mergeData = await readProfileFile(mergeUid) // merge配置文件
    const globalMergeData = await readProfileFile('Merge') // global merge配置文件

    const rulesObj = parseProfileContent(data, profileFormat) as {
      rules: []
    } | null

    const originGroupsObj = parseProfileContent(data, profileFormat) as {
      'proxy-groups': IProxyGroupConfig[]
    } | null
    const originGroups = originGroupsObj?.['proxy-groups'] || []
    const moreGroupsObj = yaml.load(groupsData) as ISeqProfileConfig | null
    const rawPrependGroups = moreGroupsObj?.['prepend']
    const morePrependGroups = Array.isArray(rawPrependGroups)
      ? (rawPrependGroups as IProxyGroupConfig[])
      : []
    const rawAppendGroups = moreGroupsObj?.['append']
    const moreAppendGroups = Array.isArray(rawAppendGroups)
      ? (rawAppendGroups as IProxyGroupConfig[])
      : []
    const rawDeleteGroups = moreGroupsObj?.['delete']
    const moreDeleteGroups: Array<string | { name: string }> = Array.isArray(
      rawDeleteGroups,
    )
      ? (rawDeleteGroups as Array<string | { name: string }>)
      : []
    const groups = morePrependGroups.concat(
      originGroups.filter((group: any) => {
        if (group.name) {
          return !moreDeleteGroups.includes(group.name)
        } else {
          return !moreDeleteGroups.includes(group)
        }
      }),
      moreAppendGroups,
    )

    const originRuleSetObj = parseProfileContent(data, profileFormat) as {
      'rule-providers': Record<string, unknown>
    } | null
    const originRuleSet = originRuleSetObj?.['rule-providers'] || {}
    const moreRuleSetObj = yaml.load(mergeData) as {
      'rule-providers': Record<string, unknown>
    } | null
    const moreRuleSet = moreRuleSetObj?.['rule-providers'] || {}
    const globalRuleSetObj = yaml.load(globalMergeData) as {
      'rule-providers': Record<string, unknown>
    } | null
    const globalRuleSet = globalRuleSetObj?.['rule-providers'] || {}
    const ruleSet = Object.assign({}, originRuleSet, moreRuleSet, globalRuleSet)

    const originSubRuleObj = parseProfileContent(data, profileFormat) as {
      'sub-rules': Record<string, unknown>
    } | null
    const originSubRule = originSubRuleObj?.['sub-rules'] || {}
    const moreSubRuleObj = yaml.load(mergeData) as {
      'sub-rules': Record<string, unknown>
    } | null
    const moreSubRule = moreSubRuleObj?.['sub-rules'] || {}
    const globalSubRuleObj = yaml.load(globalMergeData) as {
      'sub-rules': Record<string, unknown>
    } | null
    const globalSubRule = globalSubRuleObj?.['sub-rules'] || {}
    const subRule = Object.assign({}, originSubRule, moreSubRule, globalSubRule)
    setProxyPolicyList(
      builtinProxyPolicies.concat(groups.map((group: any) => group.name)),
    )
    setRuleSetList(Object.keys(ruleSet))
    setSubRuleList(Object.keys(subRule))
    setRuleList(rulesObj?.rules || [])
  }, [groupsUid, mergeUid, profileFormat, profileUid])

  useEffect(() => {
    if (!open) return
    fetchContent()
    fetchProfile()
  }, [fetchContent, fetchProfile, open])

  useEffect(() => {
    return () => {
      editorRef.current?.dispose()
      editorRef.current = null
    }
  }, [])

  const validateRule = () => {
    try {
      return serializeRule(ruleType, ruleContent, proxyPolicy, noResolve)
    } catch (error) {
      if (error instanceof RuleConfigError) {
        throw new Error(
          t(
            error.code === 'conditionRequired'
              ? 'rules.modals.editor.form.validation.conditionRequired'
              : 'rules.modals.editor.form.validation.invalidRule',
          ),
          { cause: error },
        )
      }
      throw error
    }
  }

  const handleSave = useLockFn(async () => {
    try {
      if (!(await saveProfileFile(property, currData))) {
        await fetchContent()
        onClose()
        return
      }
      showNotice.success('shared.feedback.notifications.saved')
      onSave?.(prevData, currData)
      onClose()
    } catch (err: any) {
      showNotice.error(err)
    }
  })

  return (
    <BaseDialog
      open={open}
      title={
        <div className="flex items-center justify-between pr-8">
          {t('rules.modals.editor.title')}
          <Button size="sm" onClick={() => setVisualization((prev) => !prev)}>
            {visualization
              ? t('shared.editorModes.advanced')
              : t('shared.editorModes.visualization')}
          </Button>
        </div>
      }
      contentSx={{ width: 'calc(100vw - 64px)', maxWidth: 1400 }}
      okBtn={t('shared.actions.save')}
      cancelBtn={t('shared.actions.cancel')}
      disableEnforceFocus={!visualization}
      onClose={onClose}
      onCancel={onClose}
      onOk={handleSave}
    >
      <div className="flex h-[calc(100vh-185px)] w-auto">
        {visualization ? (
          <>
            <div className="w-1/2 px-2.5">
              <div className="flex items-center gap-component px-adjust py-[5px]">
                <span className="flex-1 text-sm">
                  {t('rules.modals.editor.form.labels.type')}
                </span>
                <Select
                  value={ruleType.name}
                  onValueChange={(name) => {
                    const next = rules.find((x) => x.name === name)
                    if (next) setRuleType(next)
                  }}
                >
                  <SelectTrigger className="min-w-[240px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rules.map((option) => {
                      const label = t(
                        RULE_TYPE_LABEL_KEYS[option.name] ?? option.name,
                      )
                      return (
                        <SelectItem
                          key={option.name}
                          value={option.name}
                          title={label}
                        >
                          {label}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div
                className={cn(
                  'flex items-center gap-component px-adjust py-[5px]',
                  !(ruleType.required ?? true) && 'hidden',
                )}
              >
                <span className="flex-1 text-sm">
                  {t('rules.modals.editor.form.labels.content')}
                </span>

                {ruleType.name === 'RULE-SET' && (
                  <Select
                    value={ruleContent}
                    onValueChange={(value) => value && setRuleContent(value)}
                  >
                    <SelectTrigger className="min-w-[240px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ruleSetList.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {ruleType.name === 'SUB-RULE' && (
                  <Select
                    value={ruleContent}
                    onValueChange={(value) => value && setRuleContent(value)}
                  >
                    <SelectTrigger className="min-w-[240px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {subRuleList.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {ruleType.name !== 'RULE-SET' &&
                  ruleType.name !== 'SUB-RULE' && (
                    <Input
                      autoComplete="new-password"
                      className="min-w-[240px]"
                      value={ruleContent}
                      required={ruleType.required ?? true}
                      aria-invalid={(ruleType.required ?? true) && !ruleContent}
                      placeholder={ruleType.example}
                      onChange={(e) => setRuleContent(e.target.value)}
                    />
                  )}
              </div>
              <div className="flex items-center gap-component px-adjust py-[5px]">
                <span className="flex-1 text-sm">
                  {t('rules.modals.editor.form.labels.proxyPolicy')}
                </span>
                <Select
                  value={proxyPolicy}
                  onValueChange={(value) => value && setProxyPolicy(value)}
                >
                  <SelectTrigger className="min-w-[240px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {proxyPolicyList.map((option) => {
                      const label = t(PROXY_POLICY_LABEL_KEYS[option] ?? option)
                      return (
                        <SelectItem key={option} value={option} title={label}>
                          {label}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              {ruleType.noResolve && (
                <div className="flex items-center gap-component px-adjust py-[5px]">
                  <span className="flex-1 text-sm">
                    {t('rules.modals.editor.form.toggles.noResolve')}
                  </span>
                  <Switch
                    checked={noResolve}
                    onCheckedChange={(v) => setNoResolve(v)}
                  />
                </div>
              )}
              <div className="px-adjust py-[5px]">
                <Button
                  className="w-full"
                  onClick={() => {
                    try {
                      const raw = validateRule()
                      if (prependSeq.includes(raw)) return
                      setPrependSeq([raw, ...prependSeq])
                    } catch (err: any) {
                      showNotice.error(err)
                    }
                  }}
                >
                  <ArrowUpToLine className="size-4" />
                  {t('rules.modals.editor.form.actions.prependRule')}
                </Button>
              </div>
              <div className="px-adjust py-[5px]">
                <Button
                  className="w-full"
                  onClick={() => {
                    try {
                      const raw = validateRule()
                      if (appendSeq.includes(raw)) return
                      setAppendSeq([...appendSeq, raw])
                    } catch (err: any) {
                      showNotice.error(err)
                    }
                  }}
                >
                  <ArrowDownToLine className="size-4" />
                  {t('rules.modals.editor.form.actions.appendRule')}
                </Button>
              </div>
            </div>

            <div className="w-1/2 px-2.5">
              <BaseSearchBox onSearch={(match) => setMatch(() => match)} />
              <VirtualList
                count={
                  filteredRuleList.length +
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
            theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
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
    </BaseDialog>
  )
}
