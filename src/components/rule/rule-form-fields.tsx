import {
  Autocomplete,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
} from '@mui/material'
import type { ChangeEvent, ClipboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import {
  PROXY_POLICY_LABEL_KEYS,
  RULE_DEFINITIONS,
  RULE_TYPE_LABEL_KEYS,
  normalizePastedDomain,
  type ParsedRule,
} from './rule-config'

interface Props {
  value: ParsedRule
  policyOptions: string[]
  ruleSetOptions: string[]
  subRuleOptions: string[]
  autoFocus?: boolean
  onChange: (value: ParsedRule) => void
}

export const RuleFormFields = ({
  value,
  policyOptions,
  ruleSetOptions,
  subRuleOptions,
  autoFocus = false,
  onChange,
}: Props) => {
  const { t } = useTranslation()
  const contentOptions =
    value.definition.name === 'RULE-SET'
      ? ruleSetOptions
      : value.definition.name === 'SUB-RULE'
        ? subRuleOptions
        : null
  const normalizesDomainPaste =
    value.definition.name === 'DOMAIN' ||
    value.definition.name === 'DOMAIN-SUFFIX'
  const handleContentPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (!normalizesDomainPaste) return

    const normalizedDomain = normalizePastedDomain(
      event.clipboardData.getData('text/plain'),
    )
    if (!normalizedDomain) return

    event.preventDefault()
    onChange({ ...value, content: normalizedDomain })
  }
  const handleContentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const content = event.target.value
    const inputEvent = event.nativeEvent as InputEvent
    const isPasteLikeInput =
      inputEvent.inputType === 'insertFromPaste' ||
      inputEvent.inputType === 'insertFromDrop' ||
      (inputEvent.data?.length ?? 0) > 1
    const normalizedDomain =
      normalizesDomainPaste && isPasteLikeInput
        ? normalizePastedDomain(content)
        : null

    onChange({ ...value, content: normalizedDomain ?? content })
  }

  return (
    <Stack spacing={1.75}>
      <Autocomplete
        disableClearable
        size="small"
        options={RULE_DEFINITIONS}
        value={value.definition}
        getOptionLabel={(option) =>
          t(RULE_TYPE_LABEL_KEYS[option.name] ?? option.name)
        }
        onChange={(_, definition) =>
          onChange({ ...value, definition, content: '', noResolve: false })
        }
        renderInput={(params) => (
          <TextField
            {...params}
            autoFocus={autoFocus}
            label={t('rules.modals.editor.form.labels.type')}
          />
        )}
      />

      {(value.definition.required ?? true) &&
        (contentOptions ? (
          <Autocomplete
            freeSolo
            size="small"
            options={contentOptions}
            value={value.content}
            onChange={(_, content) =>
              onChange({ ...value, content: content ?? '' })
            }
            onInputChange={(_, content) => onChange({ ...value, content })}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('rules.modals.editor.form.labels.content')}
                placeholder={value.definition.example}
              />
            )}
          />
        ) : (
          <TextField
            size="small"
            label={t('rules.modals.editor.form.labels.content')}
            placeholder={value.definition.example}
            value={value.content}
            onPaste={handleContentPaste}
            onChange={handleContentChange}
          />
        ))}

      <Autocomplete
        freeSolo
        size="small"
        options={policyOptions}
        value={value.policy}
        getOptionLabel={(option) =>
          t(PROXY_POLICY_LABEL_KEYS[option] ?? option)
        }
        onChange={(_, policy) => policy && onChange({ ...value, policy })}
        onInputChange={(_, policy) => onChange({ ...value, policy })}
        renderInput={(params) => (
          <TextField
            {...params}
            label={t('rules.modals.editor.form.labels.proxyPolicy')}
          />
        )}
      />

      {value.definition.noResolve && (
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={value.noResolve}
              onChange={(_, noResolve) => onChange({ ...value, noResolve })}
            />
          }
          label={t('rules.modals.editor.form.toggles.noResolve')}
        />
      )}
    </Stack>
  )
}
