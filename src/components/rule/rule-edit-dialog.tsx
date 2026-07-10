import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { showNotice } from '@/services/notice-service'
import type { TranslationKey } from '@/types/generated/i18n-keys'
import { getShellThemeVars } from '@/utils/shell-theme'

import { RuleConfigError, type ParsedRule, serializeRule } from './rule-config'
import { RuleFormFields } from './rule-form-fields'

interface Props {
  open: boolean
  submitting: boolean
  originalRule: string
  initialRule: ParsedRule
  existingRules: string[]
  policyOptions: string[]
  ruleSetOptions: string[]
  subRuleOptions: string[]
  onClose: () => void
  onSubmit: (rule: string) => Promise<void>
}

const VALIDATION_KEYS: Record<string, TranslationKey> = {
  conditionRequired: 'rules.modals.editor.form.validation.conditionRequired',
  invalidRule: 'rules.modals.editor.form.validation.invalidRule',
  duplicateRule: 'rules.page.actions.add.validation.duplicateRule',
}

export const RuleEditDialog = ({
  open,
  submitting,
  originalRule,
  initialRule,
  existingRules,
  policyOptions,
  ruleSetOptions,
  subRuleOptions,
  onClose,
  onSubmit,
}: Props) => {
  const { t } = useTranslation()
  const [form, setForm] = useState(initialRule)

  const handleSubmit = async () => {
    try {
      const rawRule = serializeRule(
        form.definition,
        form.content,
        form.policy,
        form.noResolve,
      )
      if (rawRule === originalRule) {
        onClose()
        return
      }
      if (
        existingRules.some((rule) => rule !== originalRule && rule === rawRule)
      ) {
        throw new RuleConfigError('duplicateRule')
      }
      await onSubmit(rawRule)
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
            borderRadius: 2,
            bgcolor: 'var(--shell-panel) !important',
            backgroundImage: 'none',
            boxShadow: 'var(--shell-shadow) !important',
          }),
        },
      }}
    >
      <DialogTitle sx={{ px: 2.5, pt: 2.25, pb: 1 }}>
        <Typography component="span" sx={{ fontSize: 18, fontWeight: 650 }}>
          {t('rules.page.actions.edit.title')}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ px: 2.5, py: 0 }}>
        <Box sx={{ pt: 1.5, pb: 1.5 }}>
          <RuleFormFields
            autoFocus
            value={form}
            policyOptions={policyOptions}
            ruleSetOptions={ruleSetOptions}
            subRuleOptions={subRuleOptions}
            onChange={setForm}
          />
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          mt: 1.5,
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
          {t('shared.actions.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
