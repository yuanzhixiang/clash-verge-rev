import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog } from '@/components/base'
import { Button } from '@/components/ui/button'
import { showNotice } from '@/services/notice-service'
import type { TranslationKey } from '@/types/generated/i18n-keys'

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

const PLACEMENT_LABEL_KEYS: Record<RulePlacement, TranslationKey> = {
  prepend: 'rules.page.actions.add.position.prepend',
  append: 'rules.page.actions.add.position.append',
}

const PLACEMENTS: RulePlacement[] = ['prepend', 'append']

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
    <BaseDialog
      open={open}
      title={t('rules.page.actions.add.title')}
      contentSx={{ width: 420 }}
      okBtn={t('rules.page.actions.add.confirm')}
      cancelBtn={t('shared.actions.cancel')}
      loading={submitting}
      onOk={handleSubmit}
      onCancel={submitting ? undefined : onClose}
      onClose={submitting ? undefined : onClose}
    >
      <div className="flex flex-col gap-stack">
        <RuleFormFields
          autoFocus
          value={form}
          policyOptions={policyOptions}
          ruleSetOptions={ruleSetOptions}
          subRuleOptions={subRuleOptions}
          onChange={setForm}
        />

        <div>
          <p className="mb-compact text-[12.5px] font-[560] text-[var(--color-text-secondary)]">
            {t('rules.page.actions.add.position.label')}
          </p>
          <div
            role="group"
            aria-label={t('rules.page.actions.add.position.label')}
            className="flex gap-component"
          >
            {PLACEMENTS.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={placement === option ? 'default' : 'outline'}
                aria-pressed={placement === option}
                onClick={() => setPlacement(option)}
                className="flex-1"
              >
                {t(PLACEMENT_LABEL_KEYS[option])}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </BaseDialog>
  )
}
