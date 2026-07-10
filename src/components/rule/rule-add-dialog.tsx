import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { showNotice } from '@/services/notice-service'
import type { TranslationKey } from '@/types/generated/i18n-keys'
import { getShellThemeVars } from '@/utils/shell-theme'

import {
  BUILTIN_PROXY_POLICIES,
  PROXY_POLICY_LABEL_KEYS,
  RULE_DEFINITIONS,
  RULE_TYPE_LABEL_KEYS,
  RuleConfigError,
  type RulePlacement,
  serializeRule,
} from './rule-config'

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
  const [ruleTypeName, setRuleTypeName] = useState(RULE_DEFINITIONS[0]!.name)
  const [ruleContent, setRuleContent] = useState('')
  const [proxyPolicy, setProxyPolicy] = useState<string>(
    BUILTIN_PROXY_POLICIES[0],
  )
  const [noResolve, setNoResolve] = useState(false)
  const [placement, setPlacement] = useState<RulePlacement>('prepend')

  const ruleType = useMemo(
    () =>
      RULE_DEFINITIONS.find((definition) => definition.name === ruleTypeName) ??
      RULE_DEFINITIONS[0]!,
    [ruleTypeName],
  )

  const contentOptions =
    ruleType.name === 'RULE-SET'
      ? ruleSetOptions
      : ruleType.name === 'SUB-RULE'
        ? subRuleOptions
        : null

  const handleSubmit = async () => {
    try {
      const rawRule = serializeRule(
        ruleType,
        ruleContent,
        proxyPolicy,
        noResolve,
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
          {t('rules.page.actions.add.title')}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ px: 2.5, py: 0 }}>
        <Stack spacing={1.75} sx={{ pt: 1.5, pb: 1.5 }}>
          <Autocomplete
            disableClearable
            size="small"
            options={RULE_DEFINITIONS}
            value={ruleType}
            getOptionLabel={(option) =>
              t(RULE_TYPE_LABEL_KEYS[option.name] ?? option.name)
            }
            onChange={(_, value) => {
              setRuleTypeName(value.name)
              setRuleContent('')
              setNoResolve(false)
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                autoFocus
                label={t('rules.modals.editor.form.labels.type')}
              />
            )}
          />

          {(ruleType.required ?? true) &&
            (contentOptions ? (
              <Autocomplete
                freeSolo
                size="small"
                options={contentOptions}
                value={ruleContent}
                onChange={(_, value) => setRuleContent(value ?? '')}
                onInputChange={(_, value) => setRuleContent(value)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t('rules.modals.editor.form.labels.content')}
                    placeholder={ruleType.example}
                  />
                )}
              />
            ) : (
              <TextField
                size="small"
                label={t('rules.modals.editor.form.labels.content')}
                placeholder={ruleType.example}
                value={ruleContent}
                onChange={(event) => setRuleContent(event.target.value)}
              />
            ))}

          <Autocomplete
            freeSolo
            size="small"
            options={policyOptions}
            value={proxyPolicy}
            getOptionLabel={(option) =>
              t(PROXY_POLICY_LABEL_KEYS[option] ?? option)
            }
            onChange={(_, value) => value && setProxyPolicy(value)}
            onInputChange={(_, value) => setProxyPolicy(value)}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('rules.modals.editor.form.labels.proxyPolicy')}
              />
            )}
          />

          {ruleType.noResolve && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={noResolve}
                  onChange={(_, checked) => setNoResolve(checked)}
                />
              }
              label={t('rules.modals.editor.form.toggles.noResolve')}
            />
          )}

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
