import { useLockFn } from 'ahooks'
import { Loader2, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getRules } from 'tauri-plugin-mihomo-api'

import { BaseEmpty, BaseSearchBox, VirtualList } from '@/components/base'
import { ProviderButton } from '@/components/rule/provider-button'
import { RuleAddDialog } from '@/components/rule/rule-add-dialog'
import {
  RuleConfigError,
  addRuleToEnhancement,
  countRuntimeRule,
  deleteRuleFromEnhancement,
  getRuntimeRuleAtIndex,
  parseSerializedRule,
  parseRuntimeRuleConfig,
  replaceRuleInEnhancement,
  toggleRuleDisabledInEnhancement,
  type ParsedRule,
  type RulePlacement,
  type RuntimeRuleConfig,
} from '@/components/rule/rule-config'
import { RuleEditDialog } from '@/components/rule/rule-edit-dialog'
import RuleItem from '@/components/rule/rule-item'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useProfiles } from '@/hooks/use-profiles'
import { useVisibility } from '@/hooks/use-visibility'
import { cn } from '@/lib/utils'
import { useAppRefreshers, useRulesData } from '@/providers/app-data-context'
import {
  getRuntimeYaml,
  readProfileFile,
  saveProfileFile,
} from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import type { RuntimeRule } from '@/types/rule'

const RULE_GRID_COLUMNS =
  '50px 132px minmax(200px, 1fr) minmax(110px, 150px) 72px 56px'

// 表头行 / 底部工具栏的中性叠加底色（原 alpha(text.primary, 明 0.018 / 暗 0.03)）
const NEUTRAL_OVERLAY_BG =
  'bg-[color-mix(in_srgb,var(--color-text-primary)_1.8%,transparent)] dark:bg-[color-mix(in_srgb,var(--color-text-primary)_3%,transparent)]'

interface PendingDelete {
  profileUid: string
  rulesProfileUid: string
  rule: RuntimeRule
  rawRule: string
  runtime: RuntimeRuleConfig
}

interface AddDialogContext extends RuntimeRuleConfig {
  profileUid: string
  rulesProfileUid: string
}

interface EditDialogContext extends RuntimeRuleConfig {
  profileUid: string
  rulesProfileUid: string
  index: number
  rawRule: string
  parsedRule: ParsedRule
}

interface SelectedRuleTarget {
  profileUid: string
  index: number
}

const RulesPage = () => {
  const { t } = useTranslation()
  const { rules = [] } = useRulesData()
  const { refreshRules, refreshRuleProviders } = useAppRefreshers()
  const { current: currentProfile } = useProfiles()
  const [match, setMatch] = useState(() => (_: string) => true)
  const [selectedRuleTarget, setSelectedRuleTarget] =
    useState<SelectedRuleTarget | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addContext, setAddContext] = useState<AddDialogContext | null>(null)
  const [loadingAddContext, setLoadingAddContext] = useState(false)
  const [submittingAdd, setSubmittingAdd] = useState(false)
  const [editContext, setEditContext] = useState<EditDialogContext | null>(null)
  const [submittingEdit, setSubmittingEdit] = useState(false)
  const [togglingIndex, setTogglingIndex] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [preparingDelete, setPreparingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const pageVisible = useVisibility()
  const currentProfileUid = currentProfile?.uid
  const rulesProfileUid = currentProfile?.option?.rules
  const canMutateRules = Boolean(currentProfileUid && rulesProfileUid)
  const selectedRuleIndex =
    selectedRuleTarget && selectedRuleTarget.profileUid === currentProfileUid
      ? selectedRuleTarget.index
      : null

  useEffect(() => {
    if (!pageVisible) return

    void Promise.allSettled([refreshRules(), refreshRuleProviders()])
    const timer = window.setInterval(() => {
      void refreshRules()
    }, 2000)

    return () => window.clearInterval(timer)
  }, [refreshRules, refreshRuleProviders, pageVisible])

  const filteredRules = useMemo(
    () =>
      rules.filter((item) =>
        [item.type, item.payload, item.proxy].some((value) =>
          match(value ?? ''),
        ),
      ),
    [rules, match],
  )

  const handleSearch = useCallback(
    (nextMatch: (content: string) => boolean) => {
      setMatch(() => nextMatch)
      setSelectedRuleTarget(null)
    },
    [],
  )

  const selectedRule = useMemo(
    () =>
      selectedRuleIndex == null
        ? null
        : (rules.find((rule) => rule.index === selectedRuleIndex) ?? null),
    [rules, selectedRuleIndex],
  )

  const loadRuntimeRules = useCallback(async () => {
    const runtimeYaml = await getRuntimeYaml()
    if (!runtimeYaml) throw new RuleConfigError('invalidYaml')
    return parseRuntimeRuleConfig(runtimeYaml)
  }, [])

  const handleOpenAdd = useLockFn(async () => {
    if (!currentProfileUid || !rulesProfileUid) {
      showNotice.error('rules.feedback.notifications.mutationUnavailable')
      return
    }

    setLoadingAddContext(true)
    try {
      const runtime = await loadRuntimeRules()
      setAddContext({
        ...runtime,
        profileUid: currentProfileUid,
        rulesProfileUid,
      })
      setAddOpen(true)
    } catch (error) {
      showNotice.error('rules.feedback.notifications.runtimeReadFailed', {
        message: String(error),
      })
    } finally {
      setLoadingAddContext(false)
    }
  })

  const handleAddRule = useLockFn(
    async (rawRule: string, placement: RulePlacement) => {
      if (!addContext || addContext.profileUid !== currentProfileUid) {
        showNotice.error('rules.feedback.notifications.mutationUnavailable')
        return
      }

      const targetRulesProfileUid = addContext.rulesProfileUid

      setSubmittingAdd(true)
      try {
        const runtimeBefore = await loadRuntimeRules()
        const countBefore = countRuntimeRule(runtimeBefore, rawRule)
        if (countBefore > 0) throw new RuleConfigError('duplicateRule')

        const previousContent = await readProfileFile(targetRulesProfileUid)
        const mutation = addRuleToEnhancement(
          previousContent,
          rawRule,
          placement,
        )
        if (!mutation.changed) throw new RuleConfigError('duplicateRule')

        if (!(await saveProfileFile(targetRulesProfileUid, mutation.content))) {
          throw new Error(t('rules.feedback.notifications.saveFailed'))
        }

        let runtimeAfter: RuntimeRuleConfig
        try {
          runtimeAfter = await loadRuntimeRules()
        } catch (error) {
          await saveProfileFile(targetRulesProfileUid, previousContent)
          throw error
        }
        if (countRuntimeRule(runtimeAfter, rawRule) <= countBefore) {
          await saveProfileFile(targetRulesProfileUid, previousContent)
          throw new Error(t('rules.feedback.notifications.mutationNotApplied'))
        }

        setAddOpen(false)
        setAddContext(null)
        await refreshRules()
        showNotice.success('rules.feedback.notifications.addSuccess')
      } finally {
        setSubmittingAdd(false)
      }
    },
  )

  const handleOpenEdit = useLockFn(async (rule: RuntimeRule) => {
    if (!currentProfileUid || !rulesProfileUid) {
      showNotice.error('rules.feedback.notifications.mutationUnavailable')
      return
    }

    try {
      const runtime = await loadRuntimeRules()
      const rawRule = getRuntimeRuleAtIndex(runtime, rule.index)
      if (countRuntimeRule(runtime, rawRule) !== 1) {
        showNotice.error('rules.feedback.notifications.editAmbiguous')
        return
      }

      setSelectedRuleTarget({
        profileUid: currentProfileUid,
        index: rule.index,
      })
      setEditContext({
        ...runtime,
        profileUid: currentProfileUid,
        rulesProfileUid,
        index: rule.index,
        rawRule,
        parsedRule: parseSerializedRule(rawRule),
      })
    } catch (error) {
      showNotice.error('rules.feedback.notifications.editUnavailable', {
        message: String(error),
      })
    }
  })

  const handleEditRule = useLockFn(async (nextRule: string) => {
    if (!editContext || editContext.profileUid !== currentProfileUid) {
      showNotice.error('rules.feedback.notifications.mutationUnavailable')
      return
    }

    const targetRulesProfileUid = editContext.rulesProfileUid
    setSubmittingEdit(true)
    try {
      const runtimeBefore = await loadRuntimeRules()
      const currentRule = getRuntimeRuleAtIndex(
        runtimeBefore,
        editContext.index,
      )
      if (currentRule !== editContext.rawRule) {
        throw new Error(t('rules.feedback.notifications.editTargetChanged'))
      }
      if (countRuntimeRule(runtimeBefore, currentRule) !== 1) {
        throw new Error(t('rules.feedback.notifications.editAmbiguous'))
      }
      if (countRuntimeRule(runtimeBefore, nextRule) > 0) {
        throw new RuleConfigError('duplicateRule')
      }

      const previousRule =
        editContext.index > 0
          ? getRuntimeRuleAtIndex(runtimeBefore, editContext.index - 1)
          : null
      const nextNeighbor =
        editContext.index + 1 < runtimeBefore.ruleItems.length
          ? getRuntimeRuleAtIndex(runtimeBefore, editContext.index + 1)
          : null
      const previousContent = await readProfileFile(targetRulesProfileUid)
      const mutation = replaceRuleInEnhancement(
        previousContent,
        currentRule,
        nextRule,
      )
      if (!mutation.changed) {
        setEditContext(null)
        return
      }

      if (!(await saveProfileFile(targetRulesProfileUid, mutation.content))) {
        throw new Error(t('rules.feedback.notifications.saveFailed'))
      }

      let runtimeAfter: RuntimeRuleConfig
      try {
        runtimeAfter = await loadRuntimeRules()
      } catch (error) {
        await saveProfileFile(targetRulesProfileUid, previousContent)
        throw error
      }
      const ruleApplied =
        getRuntimeRuleAtIndex(runtimeAfter, editContext.index) === nextRule
      const previousPreserved =
        previousRule == null ||
        getRuntimeRuleAtIndex(runtimeAfter, editContext.index - 1) ===
          previousRule
      const nextPreserved =
        nextNeighbor == null ||
        getRuntimeRuleAtIndex(runtimeAfter, editContext.index + 1) ===
          nextNeighbor

      if (!ruleApplied || !previousPreserved || !nextPreserved) {
        await saveProfileFile(targetRulesProfileUid, previousContent)
        throw new Error(t('rules.feedback.notifications.mutationNotApplied'))
      }

      setEditContext(null)
      await refreshRules()
      showNotice.success('rules.feedback.notifications.editSuccess')
    } finally {
      setSubmittingEdit(false)
    }
  })

  // 禁用不改配置里的规则本身：规则照常留在列表和内核规则表里，只是被标记为
  // disabled。状态存在 rules 增强链的 disabled 段（存原文），apply 之后由后端
  // 调内核 PATCH /rules/disable 重放，因此下标位移和内核重载都不会丢。
  const handleToggleEnabled = useLockFn(
    async (rule: RuntimeRule, enabled: boolean) => {
      if (!currentProfileUid || !rulesProfileUid) {
        showNotice.error('rules.feedback.notifications.mutationUnavailable')
        return
      }

      const targetRulesProfileUid = rulesProfileUid
      setTogglingIndex(rule.index)
      try {
        const runtimeBefore = await loadRuntimeRules()
        const rawRule = getRuntimeRuleAtIndex(runtimeBefore, rule.index)
        // 原文是唯一的寻址依据，重复原文无法区分要禁用哪一条。
        if (countRuntimeRule(runtimeBefore, rawRule) !== 1) {
          showNotice.error('rules.feedback.notifications.toggleAmbiguous')
          return
        }

        const previousContent = await readProfileFile(targetRulesProfileUid)
        const mutation = toggleRuleDisabledInEnhancement(
          previousContent,
          rawRule,
          !enabled,
        )
        if (!mutation.changed) {
          await refreshRules()
          return
        }

        if (!(await saveProfileFile(targetRulesProfileUid, mutation.content))) {
          throw new Error(t('rules.feedback.notifications.saveFailed'))
        }

        const applied = (await getRules()).rules as RuntimeRule[]
        const target = applied.find((item) => item.index === rule.index)
        const stillSameRule =
          target?.type === rule.type && target?.payload === rule.payload
        if (!stillSameRule || (target?.extra?.disabled === true) === enabled) {
          await saveProfileFile(targetRulesProfileUid, previousContent)
          throw new Error(t('rules.feedback.notifications.mutationNotApplied'))
        }

        await refreshRules()
        showNotice.success(
          enabled
            ? 'rules.feedback.notifications.enableSuccess'
            : 'rules.feedback.notifications.disableSuccess',
        )
      } catch (error) {
        showNotice.error(error)
      } finally {
        setTogglingIndex(null)
      }
    },
  )

  const handlePrepareDelete = useLockFn(async () => {
    if (!currentProfileUid || !rulesProfileUid || !selectedRule) {
      showNotice.error('rules.feedback.notifications.mutationUnavailable')
      return
    }

    setPreparingDelete(true)
    try {
      const runtime = await loadRuntimeRules()
      const rawRule = getRuntimeRuleAtIndex(runtime, selectedRule.index)
      setPendingDelete({
        profileUid: currentProfileUid,
        rulesProfileUid,
        rule: selectedRule,
        rawRule,
        runtime,
      })
    } catch (error) {
      showNotice.error('rules.feedback.notifications.runtimeReadFailed', {
        message: String(error),
      })
    } finally {
      setPreparingDelete(false)
    }
  })

  const handleDeleteRule = useLockFn(async () => {
    if (!pendingDelete || pendingDelete.profileUid !== currentProfileUid) return

    const targetRulesProfileUid = pendingDelete.rulesProfileUid

    setDeleting(true)
    try {
      const previousContent = await readProfileFile(targetRulesProfileUid)
      const countBefore = countRuntimeRule(
        pendingDelete.runtime,
        pendingDelete.rawRule,
      )
      const mutation = deleteRuleFromEnhancement(
        previousContent,
        pendingDelete.rawRule,
      )
      if (!mutation.changed) {
        throw new Error(t('rules.feedback.notifications.mutationNotApplied'))
      }

      if (!(await saveProfileFile(targetRulesProfileUid, mutation.content))) {
        throw new Error(t('rules.feedback.notifications.saveFailed'))
      }

      let runtimeAfter: RuntimeRuleConfig
      try {
        runtimeAfter = await loadRuntimeRules()
      } catch (error) {
        await saveProfileFile(targetRulesProfileUid, previousContent)
        throw error
      }
      const countAfter = countRuntimeRule(runtimeAfter, pendingDelete.rawRule)
      const applied = mutation.removedLocalRule
        ? countAfter < countBefore
        : countAfter === 0

      if (!applied) {
        await saveProfileFile(targetRulesProfileUid, previousContent)
        throw new Error(t('rules.feedback.notifications.mutationNotApplied'))
      }

      setPendingDelete(null)
      setSelectedRuleTarget(null)
      await refreshRules()
      showNotice.success('rules.feedback.notifications.deleteSuccess')
    } catch (error) {
      showNotice.error(error)
    } finally {
      setDeleting(false)
    }
  })

  const columnHeaders = [
    { label: t('rules.page.columns.id'), align: 'text-center' },
    { label: t('rules.page.columns.type'), align: 'text-left' },
    { label: t('rules.page.columns.value'), align: 'text-left' },
    { label: t('rules.page.columns.policy'), align: 'text-left' },
    { label: t('rules.page.columns.used'), align: 'text-right' },
    { label: t('rules.page.columns.enabled'), align: 'text-center' },
  ]

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[var(--color-bg-page)]">
      <header
        data-tauri-drag-region="true"
        className="flex flex-none flex-wrap items-center gap-5 px-inset pt-4.5 pb-inset select-none sm:px-block sm:pt-5.5 sm:pb-5"
      >
        <div data-tauri-drag-region="true" className="min-w-0 flex-[1_1_170px]">
          <h1
            data-tauri-drag-region="true"
            className="m-0 text-[1.75rem] font-[720] leading-[1.08] tracking-[-0.045em] sm:text-[2.125rem]"
          >
            {t('rules.page.title')}
          </h1>
        </div>

        <div className="flex min-w-0 flex-[1_1_390px] items-center justify-end gap-stack max-sm:basis-full max-sm:flex-wrap max-sm:justify-stretch">
          <ProviderButton />
          <div className="rule-search w-full max-w-full sm:w-[340px]">
            <BaseSearchBox
              placeholder={t('rules.page.searchPlaceholder')}
              onSearch={handleSearch}
            />
          </div>
        </div>
      </header>

      <div
        role="table"
        aria-label={t('rules.page.title')}
        aria-rowcount={filteredRules.length + 1}
        style={
          { '--rules-grid-columns': RULE_GRID_COLUMNS } as React.CSSProperties
        }
        className="relative mx-stack mb-stack min-h-0 min-w-0 flex-[1_1_auto] overflow-x-auto overflow-y-hidden rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg-page)] sm:mx-block sm:mb-block"
      >
        <div className="flex h-full min-h-0 w-full min-w-[650px] flex-col">
          <div
            role="row"
            className={cn(
              'grid min-h-8 flex-[0_0_32px] grid-cols-[var(--rules-grid-columns)] items-center border-b border-[var(--color-border)]',
              NEUTRAL_OVERLAY_BG,
            )}
          >
            {columnHeaders.map((header) => (
              <div
                key={header.label}
                role="columnheader"
                title={header.label}
                className={cn(
                  'min-w-0 truncate px-component text-[12px] font-[650] leading-8 tracking-[0.01em] text-[var(--color-text-secondary)]',
                  header.align,
                )}
              >
                {header.label}
              </div>
            ))}
          </div>

          {filteredRules.length > 0 ? (
            <VirtualList
              count={filteredRules.length}
              estimateSize={32}
              overscan={8}
              getItemKey={(index) => filteredRules[index]?.index ?? index}
              renderItem={(index) => (
                <RuleItem
                  value={filteredRules[index]}
                  displayIndex={index}
                  selected={filteredRules[index]?.index === selectedRuleIndex}
                  canToggle={canMutateRules}
                  toggling={filteredRules[index]?.index === togglingIndex}
                  onSelect={(rule) =>
                    currentProfileUid &&
                    setSelectedRuleTarget({
                      profileUid: currentProfileUid,
                      index: rule.index,
                    })
                  }
                  onEdit={handleOpenEdit}
                  onToggleEnabled={handleToggleEnabled}
                />
              )}
              style={{ flex: 1, minHeight: 0, overflowX: 'hidden' }}
            />
          ) : (
            <div className="min-h-0 flex-1">
              <BaseEmpty />
            </div>
          )}

          <div
            className={cn(
              'flex flex-[0_0_40px] items-center gap-compact px-component border-t border-[var(--color-border)]',
              NEUTRAL_OVERLAY_BG,
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('rules.page.actions.add.trigger')}
                    disabled={!canMutateRules || loadingAddContext}
                    onClick={handleOpenAdd}
                    className="h-7 w-[30px] rounded-[var(--radius-compact)] text-[var(--color-text-secondary)]"
                  >
                    {loadingAddContext ? (
                      <Loader2 className="size-[15px] animate-spin" />
                    ) : (
                      <Plus className="size-[18px]" />
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {t(
                  canMutateRules
                    ? 'rules.page.actions.add.trigger'
                    : 'rules.feedback.notifications.mutationUnavailable',
                )}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('rules.page.actions.delete.trigger')}
                    disabled={
                      !canMutateRules || !selectedRule || preparingDelete
                    }
                    onClick={handlePrepareDelete}
                    className="h-7 w-[30px] rounded-[var(--radius-compact)] text-[var(--color-text-secondary)]"
                  >
                    {preparingDelete ? (
                      <Loader2 className="size-[15px] animate-spin" />
                    ) : (
                      <Minus className="size-[18px]" />
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {!canMutateRules
                  ? t('rules.feedback.notifications.mutationUnavailable')
                  : selectedRule
                    ? t('rules.page.actions.delete.trigger')
                    : t('rules.page.actions.delete.selectFirst')}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {addContext && (
        <RuleAddDialog
          open={addOpen && addContext.profileUid === currentProfileUid}
          submitting={submittingAdd}
          existingRules={addContext.rules}
          policyOptions={addContext.policyOptions}
          ruleSetOptions={addContext.ruleSetOptions}
          subRuleOptions={addContext.subRuleOptions}
          onClose={() => {
            setAddOpen(false)
            setAddContext(null)
          }}
          onSubmit={handleAddRule}
        />
      )}

      {editContext && (
        <RuleEditDialog
          key={`${editContext.profileUid}-${editContext.index}-${editContext.rawRule}`}
          open={editContext.profileUid === currentProfileUid}
          submitting={submittingEdit}
          originalRule={editContext.rawRule}
          initialRule={editContext.parsedRule}
          existingRules={editContext.rules}
          policyOptions={editContext.policyOptions}
          ruleSetOptions={editContext.ruleSetOptions}
          subRuleOptions={editContext.subRuleOptions}
          onClose={() => setEditContext(null)}
          onSubmit={handleEditRule}
        />
      )}

      <Dialog
        open={Boolean(
          pendingDelete && pendingDelete.profileUid === currentProfileUid,
        )}
        onOpenChange={(next) => {
          if (!next && !deleting) setPendingDelete(null)
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="gap-0 overflow-hidden rounded-[var(--radius-overlay)] border-[var(--color-border-strong)] bg-[var(--color-bg-page)] p-0 shadow-[var(--shadow-modal)] sm:max-w-md"
        >
          <DialogHeader className="px-5 pt-4.5 pb-2 text-left">
            <DialogTitle>{t('rules.page.actions.delete.title')}</DialogTitle>
          </DialogHeader>

          <div className="px-5 py-2.5">
            <p className="text-[13.5px] text-[var(--color-text-secondary)]">
              {t('rules.page.actions.delete.description')}
            </p>
            <code
              title={pendingDelete?.rawRule}
              className="mt-stack block truncate overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-2.5 font-mono text-[12.5px] select-text"
            >
              {pendingDelete?.rawRule}
            </code>
          </div>

          <DialogFooter className="gap-2 border-t border-[var(--color-border)] px-5 py-3">
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
              {t('shared.actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={handleDeleteRule}
            >
              {deleting && <Loader2 className="animate-spin" />}
              {t('rules.page.actions.delete.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default RulesPage
