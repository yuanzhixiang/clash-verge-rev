import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog } from '@/components/base'
import { showNotice } from '@/services/notice-service'
import type { TranslationKey } from '@/types/generated/i18n-keys'

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
    <BaseDialog
      open={open}
      title={t('rules.page.actions.edit.title')}
      contentSx={{ width: 420 }}
      okBtn={t('shared.actions.save')}
      cancelBtn={t('shared.actions.cancel')}
      loading={submitting}
      onOk={handleSubmit}
      onCancel={submitting ? undefined : onClose}
      onClose={submitting ? undefined : onClose}
    >
      <RuleFormFields
        autoFocus
        value={form}
        policyOptions={policyOptions}
        ruleSetOptions={ruleSetOptions}
        subRuleOptions={subRuleOptions}
        onChange={setForm}
      />
    </BaseDialog>
  )
}
