import type { ChangeEvent, ClipboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Switch } from '@/components/base'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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

  const showContent = value.definition.required ?? true

  return (
    <div className="flex flex-col gap-stack">
      <div className="flex flex-col gap-inline">
        <Label htmlFor="rule-type">
          {t('rules.modals.editor.form.labels.type')}
        </Label>
        <Select
          value={value.definition.name}
          onValueChange={(name) => {
            const definition =
              RULE_DEFINITIONS.find((item) => item.name === name) ??
              value.definition
            onChange({ ...value, definition, content: '', noResolve: false })
          }}
        >
          <SelectTrigger
            id="rule-type"
            autoFocus={autoFocus}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RULE_DEFINITIONS.map((definition) => (
              <SelectItem key={definition.name} value={definition.name}>
                {t(RULE_TYPE_LABEL_KEYS[definition.name] ?? definition.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showContent && (
        <div className="flex flex-col gap-inline">
          <Label htmlFor="rule-content">
            {t('rules.modals.editor.form.labels.content')}
          </Label>
          {contentOptions ? (
            <>
              <Input
                id="rule-content"
                list="rule-content-options"
                value={value.content}
                placeholder={value.definition.example}
                onChange={(event) =>
                  onChange({ ...value, content: event.target.value })
                }
              />
              <datalist id="rule-content-options">
                {contentOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </>
          ) : (
            <Input
              id="rule-content"
              value={value.content}
              placeholder={value.definition.example}
              onPaste={handleContentPaste}
              onChange={handleContentChange}
            />
          )}
        </div>
      )}

      <div className="flex flex-col gap-inline">
        <Label htmlFor="rule-policy">
          {t('rules.modals.editor.form.labels.proxyPolicy')}
        </Label>
        <Input
          id="rule-policy"
          list="rule-policy-options"
          value={value.policy}
          onChange={(event) =>
            onChange({ ...value, policy: event.target.value })
          }
        />
        <datalist id="rule-policy-options">
          {policyOptions.map((option) => {
            const labelKey = PROXY_POLICY_LABEL_KEYS[option]
            return (
              <option
                key={option}
                value={option}
                label={labelKey ? t(labelKey) : undefined}
              />
            )
          })}
        </datalist>
      </div>

      {value.definition.noResolve && (
        <label className="flex w-fit items-center gap-component">
          <Switch
            size="sm"
            checked={value.noResolve}
            onCheckedChange={(noResolve) => onChange({ ...value, noResolve })}
          />
          <span className="text-body text-[var(--color-text-secondary)]">
            {t('rules.modals.editor.form.toggles.noResolve')}
          </span>
        </label>
      )}
    </div>
  )
}
