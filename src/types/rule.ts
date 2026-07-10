import type { Rule } from 'tauri-plugin-mihomo-api'

export interface RuntimeRuleExtra {
  disabled?: boolean
  hitCount?: number
  hitAt?: string
  missCount?: number
  missAt?: string
}

export type RuntimeRule = Rule & {
  extra?: RuntimeRuleExtra
}
