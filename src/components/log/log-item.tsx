import type { ReactNode } from 'react'

import type { SearchState } from '@/components/base'

interface Props {
  value: ILogItem
  searchState?: SearchState
}

const typeColorClass = (type: string): string => {
  const key = type.toLowerCase()
  if (key === 'error' || key === 'err') return 'text-[var(--color-danger)]'
  if (key === 'warning' || key === 'warn') return 'text-[var(--color-warning)]'
  if (key === 'info' || key === 'inf') return 'text-[var(--color-info)]'
  return ''
}

const LogItem = ({ value, searchState }: Props) => {
  const renderHighlightText = (text: string) => {
    if (!searchState?.text.trim()) return text

    try {
      const searchText = searchState.text
      let pattern: string

      if (searchState.useRegularExpression) {
        try {
          new RegExp(searchText)
          pattern = searchText
        } catch {
          pattern = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        }
      } else {
        const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        pattern = searchState.matchWholeWord ? `\\b${escaped}\\b` : escaped
      }

      const flags = searchState.matchCase ? 'g' : 'gi'
      const regex = new RegExp(pattern, flags)
      const elements: ReactNode[] = []
      let lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = regex.exec(text)) !== null) {
        const start = match.index
        const matchText = match[0]

        if (matchText === '') {
          regex.lastIndex += 1
          continue
        }

        if (start > lastIndex) {
          elements.push(text.slice(lastIndex, start))
        }

        elements.push(
          <span
            key={`highlight-${start}`}
            className="rounded-[var(--radius-container)] px-adjust bg-[#ffeb3b90] dark:bg-[#ffeb3b40]"
          >
            {matchText}
          </span>,
        )

        lastIndex = start + matchText.length
      }

      if (lastIndex < text.length) {
        elements.push(text.slice(lastIndex))
      }

      return elements.length ? elements : text
    } catch {
      return text
    }
  }

  return (
    <div className="mx-stack select-text border-b border-[var(--color-border)] py-component text-body leading-[1.35]">
      <div>
        <span className="text-[var(--color-text-secondary)]">
          {renderHighlightText(value.time || '')}
        </span>
        <span
          className={`ml-component inline-block rounded-[var(--radius-container)] text-center font-semibold uppercase ${typeColorClass(value.type)}`}
        >
          {renderHighlightText(value.type)}
        </span>
      </div>
      <div>
        <span className="text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
          {renderHighlightText(value.payload)}
        </span>
      </div>
    </div>
  )
}

export default LogItem
