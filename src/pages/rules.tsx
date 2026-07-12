import AddRoundedIcon from '@mui/icons-material/AddRounded'
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import {
  alpha,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  BaseEmpty,
  BaseSearchBox,
  VirtualList,
  type VirtualListHandle,
} from '@/components/base'
import { ScrollTopButton } from '@/components/layout/scroll-top-button'
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
  type ParsedRule,
  type RulePlacement,
  type RuntimeRuleConfig,
} from '@/components/rule/rule-config'
import { RuleEditDialog } from '@/components/rule/rule-edit-dialog'
import RuleItem from '@/components/rule/rule-item'
import { useProfiles } from '@/hooks/use-profiles'
import { useVisibility } from '@/hooks/use-visibility'
import { useAppRefreshers, useRulesData } from '@/providers/app-data-context'
import {
  getRuntimeYaml,
  readProfileFile,
  saveProfileFile,
} from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import type { RuntimeRule } from '@/types/rule'
import { getShellThemeVars } from '@/utils/shell-theme'

const RULE_GRID_COLUMNS =
  '50px 132px minmax(200px, 1fr) minmax(110px, 150px) 72px'

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
  const virtuosoRef = useRef<VirtualListHandle>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [selectedRuleTarget, setSelectedRuleTarget] =
    useState<SelectedRuleTarget | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addContext, setAddContext] = useState<AddDialogContext | null>(null)
  const [loadingAddContext, setLoadingAddContext] = useState(false)
  const [submittingAdd, setSubmittingAdd] = useState(false)
  const [editContext, setEditContext] = useState<EditDialogContext | null>(null)
  const [submittingEdit, setSubmittingEdit] = useState(false)
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

  const handleScroll = useCallback((event: Event) => {
    setShowScrollTop((event.target as HTMLElement).scrollTop > 120)
  }, [])

  const scrollToTop = useCallback(() => {
    virtuosoRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

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
    t('rules.page.columns.id'),
    t('rules.page.columns.type'),
    t('rules.page.columns.value'),
    t('rules.page.columns.policy'),
    t('rules.page.columns.used'),
  ]

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        bgcolor: 'var(--shell-panel)',
      }}
    >
      <Box
        component="header"
        data-tauri-drag-region="true"
        sx={{
          display: 'flex',
          flex: '0 0 auto',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 2.5,
          px: { xs: 2, sm: 3 },
          pt: { xs: 2.25, sm: 2.75 },
          pb: { xs: 2, sm: 2.5 },
          userSelect: 'none',
        }}
      >
        <Box
          data-tauri-drag-region="true"
          sx={{ flex: '1 1 170px', minWidth: 0 }}
        >
          <Typography
            component="h1"
            data-tauri-drag-region="true"
            sx={{
              m: 0,
              fontSize: { xs: 28, sm: 34 },
              fontWeight: 720,
              lineHeight: 1.08,
              letterSpacing: '-0.045em',
            }}
          >
            {t('rules.page.title')}
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flex: '1 1 390px',
            minWidth: 0,
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 1,
            '@media (max-width: 620px)': {
              flexBasis: '100%',
              flexWrap: 'wrap',
              justifyContent: 'stretch',
              '& > *': { flexGrow: 1 },
            },
          }}
        >
          <ProviderButton />
          <Box sx={{ width: { xs: '100%', sm: 340 }, maxWidth: '100%' }}>
            <BaseSearchBox
              placeholder={t('rules.page.searchPlaceholder')}
              startAdornment={
                <SearchRoundedIcon aria-hidden sx={{ fontSize: 19 }} />
              }
              onSearch={handleSearch}
              sx={({ palette }) => ({
                '& .MuiOutlinedInput-root': {
                  height: 38,
                  borderRadius: '999px',
                  bgcolor:
                    palette.mode === 'dark'
                      ? alpha(palette.common.white, 0.045)
                      : alpha(palette.common.white, 0.82),
                  transition:
                    'background-color 160ms ease, border-color 160ms ease',
                  '& fieldset': {
                    borderColor: 'var(--shell-border)',
                  },
                  '&:hover fieldset': {
                    borderColor: 'var(--shell-border)',
                  },
                  '&.Mui-focused fieldset': {
                    borderWidth: 1,
                    borderColor: palette.primary.main,
                  },
                },
                '& .MuiInputBase-input': {
                  fontSize: 13.5,
                },
              })}
            />
          </Box>
        </Box>
      </Box>

      <Box
        role="table"
        aria-label={t('rules.page.title')}
        aria-rowcount={filteredRules.length + 1}
        sx={{
          '--rules-grid-columns': RULE_GRID_COLUMNS,
          position: 'relative',
          flex: '1 1 auto',
          minWidth: 0,
          minHeight: 0,
          mx: { xs: 1.5, sm: 3 },
          mb: { xs: 1.5, sm: 3 },
          overflowX: 'auto',
          overflowY: 'hidden',
          border: '1px solid var(--shell-border)',
          borderRadius: '9px',
          bgcolor: 'var(--shell-panel)',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            minWidth: 650,
            height: '100%',
            minHeight: 0,
          }}
        >
          <Box
            role="row"
            sx={{
              display: 'grid',
              gridTemplateColumns: 'var(--rules-grid-columns)',
              flex: '0 0 32px',
              alignItems: 'center',
              boxSizing: 'border-box',
              minHeight: 32,
              borderBottom: '1px solid var(--shell-border)',
              bgcolor: ({ palette }) =>
                alpha(
                  palette.text.primary,
                  palette.mode === 'dark' ? 0.03 : 0.018,
                ),
            }}
          >
            {columnHeaders.map((header, index) => (
              <Typography
                key={header}
                role="columnheader"
                color="text.secondary"
                title={header}
                sx={{
                  minWidth: 0,
                  px: 1,
                  overflow: 'hidden',
                  fontSize: 12,
                  fontWeight: 650,
                  lineHeight: '32px',
                  letterSpacing: '0.01em',
                  textAlign:
                    index === 0 ? 'center' : index === 4 ? 'right' : 'left',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {header}
              </Typography>
            ))}
          </Box>

          {filteredRules.length > 0 ? (
            <VirtualList
              ref={virtuosoRef}
              count={filteredRules.length}
              estimateSize={32}
              overscan={8}
              getItemKey={(index) => filteredRules[index]?.index ?? index}
              renderItem={(index) => (
                <RuleItem
                  value={filteredRules[index]}
                  displayIndex={index}
                  selected={filteredRules[index]?.index === selectedRuleIndex}
                  onSelect={(rule) =>
                    currentProfileUid &&
                    setSelectedRuleTarget({
                      profileUid: currentProfileUid,
                      index: rule.index,
                    })
                  }
                  onEdit={handleOpenEdit}
                />
              )}
              style={{ flex: 1, minHeight: 0, overflowX: 'hidden' }}
              onScroll={handleScroll}
            />
          ) : (
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <BaseEmpty />
            </Box>
          )}

          <Box
            sx={{
              display: 'flex',
              flex: '0 0 40px',
              alignItems: 'center',
              gap: 0.75,
              px: 1,
              borderTop: '1px solid var(--shell-border)',
              bgcolor: ({ palette }) =>
                alpha(
                  palette.text.primary,
                  palette.mode === 'dark' ? 0.03 : 0.018,
                ),
            }}
          >
            <Tooltip
              title={t(
                canMutateRules
                  ? 'rules.page.actions.add.trigger'
                  : 'rules.feedback.notifications.mutationUnavailable',
              )}
            >
              <span>
                <IconButton
                  size="small"
                  aria-label={t('rules.page.actions.add.trigger')}
                  disabled={!canMutateRules || loadingAddContext}
                  onClick={handleOpenAdd}
                  sx={{
                    width: 30,
                    height: 28,
                    borderRadius: 1,
                    bgcolor: 'transparent',
                    '&:hover': {
                      bgcolor: 'var(--shell-nav-hover)',
                    },
                    '&:focus-visible': {
                      outline: '2px solid var(--shell-focus)',
                      outlineOffset: 1,
                    },
                  }}
                >
                  {loadingAddContext ? (
                    <CircularProgress size={15} />
                  ) : (
                    <AddRoundedIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip
              title={
                !canMutateRules
                  ? t('rules.feedback.notifications.mutationUnavailable')
                  : selectedRule
                    ? t('rules.page.actions.delete.trigger')
                    : t('rules.page.actions.delete.selectFirst')
              }
            >
              <span>
                <IconButton
                  size="small"
                  aria-label={t('rules.page.actions.delete.trigger')}
                  disabled={!canMutateRules || !selectedRule || preparingDelete}
                  onClick={handlePrepareDelete}
                  sx={{
                    width: 30,
                    height: 28,
                    borderRadius: 1,
                    bgcolor: 'transparent',
                    '&:hover': {
                      bgcolor: 'var(--shell-nav-hover)',
                    },
                    '&:focus-visible': {
                      outline: '2px solid var(--shell-focus)',
                      outlineOffset: 1,
                    },
                  }}
                >
                  {preparingDelete ? (
                    <CircularProgress size={15} />
                  ) : (
                    <RemoveRoundedIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      <ScrollTopButton
        ariaLabel={t('rules.page.actions.scrollTop')}
        onClick={scrollToTop}
        show={showScrollTop && filteredRules.length > 0}
        sx={{
          right: { xs: 20, sm: 36 },
          bottom: { xs: 60, sm: 76 },
          border: '1px solid transparent',
          bgcolor: 'var(--shell-panel-muted) !important',
          '&:hover': {
            borderColor: 'var(--shell-border)',
          },
          '&:focus-visible': {
            outline: '2px solid var(--shell-focus) !important',
            outlineOffset: 2,
          },
        }}
      />

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
        onClose={deleting ? undefined : () => setPendingDelete(null)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            sx: ({ palette }) => ({
              ...getShellThemeVars(palette),
              overflow: 'hidden',
              border: '1px solid var(--shell-border-strong) !important',
              borderRadius: 2,
              bgcolor: 'var(--shell-panel) !important',
              backgroundImage: 'none',
              boxShadow: 'var(--shell-shadow) !important',
            }),
          },
        }}
      >
        <DialogTitle sx={{ px: 2.5, pt: 2.25, pb: 1 }}>
          {t('rules.page.actions.delete.title')}
        </DialogTitle>
        <DialogContent sx={{ px: 2.5, py: 1.25 }}>
          <Typography color="text.secondary" sx={{ fontSize: 13.5 }}>
            {t('rules.page.actions.delete.description')}
          </Typography>
          <Box
            component="code"
            title={pendingDelete?.rawRule}
            sx={{
              display: 'block',
              mt: 1.5,
              p: 1.25,
              overflow: 'hidden',
              border: '1px solid var(--shell-border)',
              borderRadius: 1.25,
              bgcolor: 'var(--shell-panel-muted)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12.5,
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              userSelect: 'text',
            }}
          >
            {pendingDelete?.rawRule}
          </Box>
        </DialogContent>
        <DialogActions
          sx={{
            px: 2.5,
            py: 1.5,
            borderTop: '1px solid var(--shell-border)',
          }}
        >
          <Button
            variant="outlined"
            disabled={deleting}
            onClick={() => setPendingDelete(null)}
            sx={{ textTransform: 'none' }}
          >
            {t('shared.actions.cancel')}
          </Button>
          <Button
            color="error"
            variant="contained"
            loading={deleting}
            onClick={handleDeleteRule}
            sx={{ textTransform: 'none' }}
          >
            {t('rules.page.actions.delete.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default RulesPage
