import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { showNotice } from '@/services/notice-service'
import type { TranslationKey } from '@/types/generated/i18n-keys'
import { getShellThemeVars } from '@/utils/shell-theme'

import {
  BUILTIN_PROXY_POLICIES,
  DEFAULT_RULE_DEFINITION,
  RuleConfigError,
  type ParsedRule,
  type RulePlacement,
  serializeRule,
} from './rule-config'
import { RuleFormFields } from './rule-form-fields'

interface Props {
  open: boolean
  submitting: boolean
  existingRules: string[]
  policyOptions: string[]
  ruleSetOptions: string[]
  subRuleOptions: string[]
  onClose: () => void
  onSubmit: (rule: string, placement: RulePlacement) => Promise<void>
}

const VALIDATION_KEYS: Record<string, TranslationKey> = {
  conditionRequired: 'rules.modals.editor.form.validation.conditionRequired',
  invalidRule: 'rules.modals.editor.form.validation.invalidRule',
  duplicateRule: 'rules.page.actions.add.validation.duplicateRule',
}

export const RuleAddDialog = ({
  open,
  submitting,
  existingRules,
  policyOptions,
  ruleSetOptions,
  subRuleOptions,
  onClose,
  onSubmit,
}: Props) => {
  const { t } = useTranslation()
  const [form, setForm] = useState<ParsedRule>(() => ({
    definition: DEFAULT_RULE_DEFINITION,
    content: '',
    policy: BUILTIN_PROXY_POLICIES[0],
    noResolve: false,
  }))
  const [placement, setPlacement] = useState<RulePlacement>('prepend')

  const handleSubmit = async () => {
    try {
      const rawRule = serializeRule(
        form.definition,
        form.content,
        form.policy,
        form.noResolve,
      )
      if (existingRules.includes(rawRule)) {
        throw new RuleConfigError('duplicateRule')
      }
      await onSubmit(rawRule, placement)
    } catch (error) {
      if (error instanceof RuleConfigError) {
        showNotice.error(VALIDATION_KEYS[error.code] ?? error.message)
      } else {
        showNotice.error(error)
      }
    }
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: ({ palette }) => ({
            ...getShellThemeVars(palette),
            overflow: 'hidden',
            border: '1px solid var(--shell-border-strong) !important',
            borderRadius: 'var(--radius-overlay)',
            bgcolor: 'var(--shell-panel) !important',
            backgroundImage: 'none',
            boxShadow: 'var(--shell-shadow) !important',
          }),
        },
      }}
    >
      <DialogTitle sx={{ px: 2.5, pt: 2.25, pb: 1 }}>
        <Typography component="span" sx={{ fontSize: 18, fontWeight: 650 }}>
          {t('rules.page.actions.add.title')}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ px: 2.5, py: 0 }}>
        <Stack spacing={1.75} sx={{ pt: 1.5, pb: 1.5 }}>
          <RuleFormFields
            autoFocus
            value={form}
            policyOptions={policyOptions}
            ruleSetOptions={ruleSetOptions}
            subRuleOptions={subRuleOptions}
            onChange={setForm}
          />

          <Box>
            <Typography
              color="text.secondary"
              sx={{ mb: 0.75, fontSize: 12.5, fontWeight: 560 }}
            >
              {t('rules.page.actions.add.position.label')}
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={placement}
              onChange={(_, value: RulePlacement | null) =>
                value && setPlacement(value)
              }
              aria-label={t('rules.page.actions.add.position.label')}
              sx={{ '& .MuiToggleButton-root': { py: 0.65 } }}
            >
              <ToggleButton value="prepend">
                {t('rules.page.actions.add.position.prepend')}
              </ToggleButton>
              <ToggleButton value="append">
                {t('rules.page.actions.add.position.append')}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Stack>
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
          onClick={onClose}
          disabled={submitting}
          sx={{ textTransform: 'none' }}
        >
          {t('shared.actions.cancel')}
        </Button>
        <Button
          variant="contained"
          loading={submitting}
          onClick={handleSubmit}
          sx={{ textTransform: 'none' }}
        >
          {t('rules.page.actions.add.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
