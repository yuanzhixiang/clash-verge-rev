import yaml from 'js-yaml'
import { getDomain } from 'tldts'

import type { TranslationKey } from '@/types/generated/i18n-keys'
import getSystem from '@/utils/get-system'
import { isValidIpCidr } from '@/utils/network'

export interface RuleDefinition {
  name: string
  required?: boolean
  example?: string
  noResolve?: boolean
  validator?: (value: string) => boolean
}

export interface ParsedRule {
  definition: RuleDefinition
  content: string
  policy: string
  noResolve: boolean
}

export type RulePlacement = 'prepend' | 'append'

export type RuleConfigErrorCode =
  | 'conditionRequired'
  | 'invalidRule'
  | 'duplicateRule'
  | 'invalidYaml'
  | 'invalidEnhancement'
  | 'ruleUnavailable'

export class RuleConfigError extends Error {
  constructor(public readonly code: RuleConfigErrorCode) {
    super(code)
    this.name = 'RuleConfigError'
  }
}

const portValidator = (value: string): boolean =>
  /^(?:[1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5])$/.test(
    value,
  )

export const RULE_DEFINITIONS: readonly RuleDefinition[] = [
  { name: 'DOMAIN', example: 'example.com' },
  { name: 'DOMAIN-SUFFIX', example: 'example.com' },
  { name: 'DOMAIN-KEYWORD', example: 'example' },
  { name: 'DOMAIN-REGEX', example: 'example.*' },
  { name: 'GEOSITE', example: 'youtube' },
  { name: 'GEOIP', example: 'CN', noResolve: true },
  { name: 'SRC-GEOIP', example: 'CN' },
  {
    name: 'IP-ASN',
    example: '13335',
    noResolve: true,
    validator: (value) => Boolean(Number(value)),
  },
  {
    name: 'SRC-IP-ASN',
    example: '9808',
    validator: (value) => Boolean(Number(value)),
  },
  {
    name: 'IP-CIDR',
    example: '127.0.0.0/8',
    noResolve: true,
    validator: isValidIpCidr,
  },
  {
    name: 'IP-CIDR6',
    example: '2620:0:2d0:200::7/32',
    noResolve: true,
    validator: isValidIpCidr,
  },
  {
    name: 'SRC-IP-CIDR',
    example: '192.168.1.201/32',
    validator: isValidIpCidr,
  },
  {
    name: 'IP-SUFFIX',
    example: '8.8.8.8/24',
    noResolve: true,
    validator: isValidIpCidr,
  },
  {
    name: 'SRC-IP-SUFFIX',
    example: '192.168.1.201/8',
    validator: isValidIpCidr,
  },
  { name: 'SRC-PORT', example: '7777', validator: portValidator },
  { name: 'DST-PORT', example: '80', validator: portValidator },
  { name: 'IN-PORT', example: '7897', validator: portValidator },
  { name: 'DSCP', example: '4' },
  {
    name: 'PROCESS-NAME',
    example: getSystem() === 'windows' ? 'chrome.exe' : 'curl',
  },
  {
    name: 'PROCESS-PATH',
    example:
      getSystem() === 'windows'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : '/usr/bin/wget',
  },
  { name: 'PROCESS-NAME-REGEX', example: '.*telegram.*' },
  {
    name: 'PROCESS-PATH-REGEX',
    example:
      getSystem() === 'windows' ? '(?i).*Application\\chrome.*' : '.*bin/wget',
  },
  {
    name: 'NETWORK',
    example: 'udp',
    validator: (value) => ['tcp', 'udp'].includes(value.toLowerCase()),
  },
  {
    name: 'UID',
    example: '1001',
    validator: (value) => Boolean(Number(value)),
  },
  { name: 'IN-TYPE', example: 'SOCKS/HTTP' },
  { name: 'IN-USER', example: 'mihomo' },
  { name: 'IN-NAME', example: 'ss' },
  { name: 'SUB-RULE', example: '(NETWORK,tcp)' },
  { name: 'RULE-SET', example: 'provider-name', noResolve: true },
  { name: 'AND', example: '((DOMAIN,baidu.com),(NETWORK,UDP))' },
  { name: 'OR', example: '((NETWORK,UDP),(DOMAIN,baidu.com))' },
  { name: 'NOT', example: '((DOMAIN,baidu.com))' },
  { name: 'MATCH', required: false },
]

const domainSuffixDefinition = RULE_DEFINITIONS.find(
  (definition) => definition.name === 'DOMAIN-SUFFIX',
)
if (!domainSuffixDefinition) {
  throw new Error('DOMAIN-SUFFIX rule definition is required')
}
export const DEFAULT_RULE_DEFINITION = domainSuffixDefinition

export const RULE_TYPE_LABEL_KEYS: Record<string, TranslationKey> =
  Object.fromEntries(
    RULE_DEFINITIONS.map((rule) => [
      rule.name,
      `rules.modals.editor.ruleTypes.${rule.name}` as TranslationKey,
    ]),
  )

export const BUILTIN_PROXY_POLICIES = [
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'PASS',
] as const

export const PROXY_POLICY_LABEL_KEYS: Record<string, TranslationKey> =
  Object.fromEntries(
    BUILTIN_PROXY_POLICIES.map((policy) => [
      policy,
      `proxies.components.enums.policies.${policy}` as TranslationKey,
    ]),
  )

export const normalizePastedDomain = (rawValue: string): string | null => {
  const value = rawValue.trim()
  if (!value || /\s/.test(value) || value.includes('*')) return null

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`

  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

    const hostname = url.hostname.replace(/\.$/, '').toLowerCase()
    if (!hostname || hostname === 'localhost') return null

    return (
      getDomain(hostname, { allowPrivateDomains: true })?.toLowerCase() ?? null
    )
  } catch {
    return null
  }
}

export const serializeRule = (
  definition: RuleDefinition,
  content: string,
  policy: string,
  noResolve: boolean,
): string => {
  const normalizedContent = content.trim()
  const normalizedPolicy = policy.trim()

  if ((definition.required ?? true) && !normalizedContent) {
    throw new RuleConfigError('conditionRequired')
  }
  if (definition.validator && !definition.validator(normalizedContent)) {
    throw new RuleConfigError('invalidRule')
  }
  if (!normalizedPolicy) {
    throw new RuleConfigError('invalidRule')
  }

  return `${definition.name}${normalizedContent ? `,${normalizedContent}` : ''},${normalizedPolicy}${
    definition.noResolve && noResolve ? ',no-resolve' : ''
  }`
}

export const parseSerializedRule = (rawRule: string): ParsedRule => {
  const parts = rawRule.split(',')
  const typeName = parts.shift()?.trim().toUpperCase()
  const definition = RULE_DEFINITIONS.find(
    (candidate) => candidate.name === typeName,
  )
  if (!definition) throw new RuleConfigError('ruleUnavailable')

  const noResolve = parts.at(-1)?.trim().toLowerCase() === 'no-resolve'
  if (noResolve) parts.pop()
  if (noResolve && !definition.noResolve) {
    throw new RuleConfigError('invalidRule')
  }

  const policy = parts.pop()?.trim() ?? ''
  const content = parts.join(',').trim()
  if (!policy || ((definition.required ?? true) && !content)) {
    throw new RuleConfigError('invalidRule')
  }

  return { definition, content, policy, noResolve }
}

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const parseRecord = (content: string): UnknownRecord => {
  const parsed = yaml.load(content)
  if (parsed == null) return {}
  if (!isRecord(parsed)) throw new RuleConfigError('invalidYaml')
  return parsed
}

const readStringArray = (
  document: UnknownRecord,
  key: 'prepend' | 'append' | 'delete' | 'disabled',
): string[] => {
  const value = document[key]
  if (value == null) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new RuleConfigError('invalidEnhancement')
  }
  return [...value] as string[]
}

export interface RuntimeRuleConfig {
  ruleItems: unknown[]
  rules: string[]
  policyOptions: string[]
  ruleSetOptions: string[]
  subRuleOptions: string[]
}

export const parseRuntimeRuleConfig = (content: string): RuntimeRuleConfig => {
  const document = parseRecord(content)
  const ruleItems = Array.isArray(document.rules) ? document.rules : []
  const groups = Array.isArray(document['proxy-groups'])
    ? document['proxy-groups']
    : []
  const groupNames = groups.flatMap((group) => {
    if (!isRecord(group) || typeof group.name !== 'string') return []
    return [group.name]
  })
  const ruleProviders = isRecord(document['rule-providers'])
    ? Object.keys(document['rule-providers'])
    : []
  const subRules = isRecord(document['sub-rules'])
    ? Object.keys(document['sub-rules'])
    : []

  return {
    ruleItems,
    rules: ruleItems.filter((item): item is string => typeof item === 'string'),
    policyOptions: [...new Set([...BUILTIN_PROXY_POLICIES, ...groupNames])],
    ruleSetOptions: ruleProviders,
    subRuleOptions: subRules,
  }
}

export const getRuntimeRuleAtIndex = (
  runtime: RuntimeRuleConfig,
  index: number,
): string => {
  const rule = runtime.ruleItems[index]
  if (typeof rule !== 'string') throw new RuleConfigError('ruleUnavailable')
  return rule
}

export const countRuntimeRule = (
  runtime: RuntimeRuleConfig,
  rule: string,
): number => runtime.rules.filter((item) => item === rule).length

interface RuleEnhancementState {
  document: UnknownRecord
  prepend: string[]
  append: string[]
  delete: string[]
  replace: RuleReplacement[]
  /** 保留在规则列表里但不参与匹配的规则原文，由内核 `PATCH /rules/disable` 落地。 */
  disabled: string[]
}

export interface RuleReplacement {
  from: string
  to: string
}

const readReplacements = (document: UnknownRecord): RuleReplacement[] => {
  const value = document.replace
  if (value == null) return []
  if (!Array.isArray(value)) throw new RuleConfigError('invalidEnhancement')

  return value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.from !== 'string' ||
      typeof item.to !== 'string'
    ) {
      throw new RuleConfigError('invalidEnhancement')
    }
    return { from: item.from, to: item.to }
  })
}

const parseRuleEnhancement = (content: string): RuleEnhancementState => {
  const document = parseRecord(content)
  return {
    document,
    prepend: readStringArray(document, 'prepend'),
    append: readStringArray(document, 'append'),
    delete: readStringArray(document, 'delete'),
    replace: readReplacements(document),
    disabled: readStringArray(document, 'disabled'),
  }
}

const dumpRuleEnhancement = (state: RuleEnhancementState): string =>
  yaml.dump(
    {
      ...state.document,
      prepend: state.prepend,
      append: state.append,
      delete: state.delete,
      replace: state.replace,
      disabled: state.disabled,
    },
    { forceQuotes: true, lineWidth: -1 },
  )

export const addRuleToEnhancement = (
  content: string,
  rule: string,
  placement: RulePlacement,
): { content: string; changed: boolean } => {
  const state = parseRuleEnhancement(content)
  const target = state[placement]
  if (target.includes(rule)) return { content, changed: false }

  state[placement] =
    placement === 'prepend' ? [rule, ...target] : [...target, rule]
  return { content: dumpRuleEnhancement(state), changed: true }
}

export const deleteRuleFromEnhancement = (
  content: string,
  rule: string,
): { content: string; changed: boolean; removedLocalRule: boolean } => {
  const state = parseRuleEnhancement(content)
  const removedLocalRule =
    state.prepend.includes(rule) || state.append.includes(rule)
  const replacementIndexes = state.replace.flatMap((replacement, index) =>
    replacement.to === rule ? [index] : [],
  )
  if (replacementIndexes.length > 1) {
    throw new RuleConfigError('invalidEnhancement')
  }
  const alreadyDeleted = state.delete.includes(rule)
  // 规则被删掉之后禁用标记就没有归属了，一并清掉避免留下永远匹配不上的原文。
  const clearedDisabled = state.disabled.includes(rule)
  state.disabled = state.disabled.filter((item) => item !== rule)

  state.prepend = state.prepend.filter((item) => item !== rule)
  state.append = state.append.filter((item) => item !== rule)
  const replacementIndex = replacementIndexes[0]
  if (
    !removedLocalRule &&
    replacementIndexes.length === 1 &&
    replacementIndex != null
  ) {
    const [replacement] = state.replace.splice(replacementIndex, 1)
    if (replacement && !state.delete.includes(replacement.from)) {
      state.delete.push(replacement.from)
    }
  } else if (!removedLocalRule && !alreadyDeleted) {
    state.delete.push(rule)
  }

  const changed =
    removedLocalRule ||
    replacementIndexes.length === 1 ||
    (!removedLocalRule && !alreadyDeleted) ||
    clearedDisabled
  return {
    content: changed ? dumpRuleEnhancement(state) : content,
    changed,
    removedLocalRule,
  }
}

export const isRuleDisabledInEnhancement = (
  content: string,
  rule: string,
): boolean => parseRuleEnhancement(content).disabled.includes(rule)

/**
 * 切换「保留但禁用」标记。
 *
 * 规则本身不动：它照常进入 runtime 配置和内核规则表，只是 apply 之后由后端调用
 * 内核 `PATCH /rules/disable` 标记为 disabled，因此这里存的是规则原文而不是下标。
 */
export const toggleRuleDisabledInEnhancement = (
  content: string,
  rule: string,
  disabled: boolean,
): { content: string; changed: boolean } => {
  const state = parseRuleEnhancement(content)
  if (state.disabled.includes(rule) === disabled) {
    return { content, changed: false }
  }

  state.disabled = disabled
    ? [...state.disabled, rule]
    : state.disabled.filter((item) => item !== rule)
  return { content: dumpRuleEnhancement(state), changed: true }
}

export const replaceRuleInEnhancement = (
  content: string,
  previousRule: string,
  nextRule: string,
): { content: string; changed: boolean } => {
  if (previousRule === nextRule) return { content, changed: false }

  const state = parseRuleEnhancement(content)
  // 禁用标记按原文寻址，改了原文就要跟着迁移，否则编辑一条被禁用的规则会把它悄悄启用。
  if (state.disabled.includes(previousRule)) {
    state.disabled = [
      ...new Set(
        state.disabled.map((item) => (item === previousRule ? nextRule : item)),
      ),
    ]
  }
  let replacedLocalRule = false
  const replaceLocal = (rules: string[]) =>
    rules.map((rule) => {
      if (!replacedLocalRule && rule === previousRule) {
        replacedLocalRule = true
        return nextRule
      }
      return rule
    })

  state.prepend = replaceLocal(state.prepend)
  state.append = replaceLocal(state.append)
  if (!replacedLocalRule) {
    const replacementIndexes = state.replace.flatMap((replacement, index) =>
      replacement.to === previousRule ? [index] : [],
    )
    if (replacementIndexes.length > 1) {
      throw new RuleConfigError('invalidEnhancement')
    }

    if (replacementIndexes.length === 1) {
      const index = replacementIndexes[0]
      const replacement = index == null ? null : state.replace[index]
      if (index == null || !replacement) {
        throw new RuleConfigError('invalidEnhancement')
      }
      if (replacement.from === nextRule) {
        state.replace.splice(index, 1)
      } else {
        state.replace[index] = { ...replacement, to: nextRule }
      }
    } else {
      state.replace.push({ from: previousRule, to: nextRule })
    }
  }

  return { content: dumpRuleEnhancement(state), changed: true }
}
