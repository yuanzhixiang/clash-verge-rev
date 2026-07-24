import { Search, X } from 'lucide-react'
import {
  type ChangeEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import MatchCaseIcon from '@/assets/image/component/match_case.svg?react'
import MatchWholeWordIcon from '@/assets/image/component/match_whole_word.svg?react'
import UseRegularExpressionIcon from '@/assets/image/component/use_regular_expression.svg?react'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { buildRegex, compileStringMatcher } from '@/utils/search-matcher'

export type SearchState = {
  text: string
  matchCase: boolean
  matchWholeWord: boolean
  useRegularExpression: boolean
}

type SearchOptionState = Omit<SearchState, 'text'>

type SearchProps = {
  value?: string
  defaultValue?: string
  autoFocus?: boolean
  placeholder?: string
  matchCase?: boolean
  matchWholeWord?: boolean
  useRegularExpression?: boolean
  searchState?: Partial<SearchOptionState>
  startAdornment?: ReactNode
  className?: string
  onSearch: (match: (content: string) => boolean, state: SearchState) => void
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
}

const useControllableState = <T,>(options: {
  controlled: T | undefined
  defaultValue: T
}) => {
  const { controlled, defaultValue } = options
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const isControlled = controlled !== undefined

  const value = isControlled ? controlled : uncontrolled

  const setValue = useCallback(
    (next: T) => {
      if (!isControlled) setUncontrolled(next)
    },
    [isControlled],
  )

  return [value, setValue] as const
}

// 开关按钮的通用样式：ghost 图标按钮
const toggleButtonClass = buttonVariants({ variant: 'ghost', size: 'icon-xs' })

export const BaseSearchBox = ({
  value,
  defaultValue,
  autoFocus,
  placeholder,
  searchState,
  matchCase: defaultMatchCase = false,
  matchWholeWord: defaultMatchWholeWord = false,
  useRegularExpression: defaultUseRegularExpression = false,
  startAdornment,
  className,
  onSearch,
  onClick,
}: SearchProps) => {
  const { t } = useTranslation()
  const onSearchRef = useRef(onSearch)
  // 用初始状态初始化，使挂载时的 emitSearch 因状态相同而被跳过，
  // 从而只在输入内容真正变化时才触发 onSearch（也可避免 StrictMode 下的重复调用）。
  const lastSearchStateRef = useRef<SearchState | null>({
    text: value ?? defaultValue ?? '',
    matchCase: searchState?.matchCase ?? defaultMatchCase,
    matchWholeWord: searchState?.matchWholeWord ?? defaultMatchWholeWord,
    useRegularExpression:
      searchState?.useRegularExpression ?? defaultUseRegularExpression,
  })

  const [text, setText] = useControllableState<string>({
    controlled: value,
    defaultValue: defaultValue ?? '',
  })

  const [matchCase, setMatchCase] = useControllableState<boolean>({
    controlled: searchState?.matchCase,
    defaultValue: defaultMatchCase,
  })

  const [matchWholeWord, setMatchWholeWord] = useControllableState<boolean>({
    controlled: searchState?.matchWholeWord,
    defaultValue: defaultMatchWholeWord,
  })

  const [useRegularExpression, setUseRegularExpression] =
    useControllableState<boolean>({
      controlled: searchState?.useRegularExpression,
      defaultValue: defaultUseRegularExpression,
    })

  useEffect(() => {
    onSearchRef.current = onSearch
  }, [onSearch])

  const emitSearch = useCallback((nextState: SearchState) => {
    const prevState = lastSearchStateRef.current
    const isSameState =
      !!prevState &&
      prevState.text === nextState.text &&
      prevState.matchCase === nextState.matchCase &&
      prevState.matchWholeWord === nextState.matchWholeWord &&
      prevState.useRegularExpression === nextState.useRegularExpression
    if (isSameState) return

    const compiled = compileStringMatcher(nextState.text, nextState)
    onSearchRef.current(compiled.matcher, nextState)

    lastSearchStateRef.current = nextState
  }, [])

  useEffect(() => {
    emitSearch({ text, matchCase, matchWholeWord, useRegularExpression })
  }, [emitSearch, matchCase, matchWholeWord, text, useRegularExpression])

  const effectiveErrorMessage = useMemo(() => {
    if (!useRegularExpression || !text) return ''
    const flags = matchCase ? '' : 'i'
    return buildRegex(text, flags) ? '' : t('shared.validation.invalidRegex')
  }, [matchCase, t, text, useRegularExpression])

  const handleChangeText = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const nextText = e.target?.value ?? ''
    setText(nextText)
    emitSearch({
      text: nextText,
      matchCase,
      matchWholeWord,
      useRegularExpression,
    })
  }

  const handleToggleUseRegularExpression = () => {
    const next = !useRegularExpression
    setUseRegularExpression(next)
    emitSearch({
      text,
      matchCase,
      matchWholeWord,
      useRegularExpression: next,
    })
  }

  const handleClearInput = () => {
    setText('')
    emitSearch({ text: '', matchCase, matchWholeWord, useRegularExpression })
  }

  const handleToggleMatchCase = () => {
    const next = !matchCase
    setMatchCase(next)
    emitSearch({ text, matchCase: next, matchWholeWord, useRegularExpression })
  }

  const handleToggleMatchWholeWord = () => {
    const next = !matchWholeWord
    setMatchWholeWord(next)
    emitSearch({ text, matchCase, matchWholeWord: next, useRegularExpression })
  }

  const toggleIconClass = (active: boolean) =>
    cn(
      'size-5',
      active ? 'fill-[var(--color-accent)]' : 'fill-[var(--color-text-muted)]',
    )

  return (
    <div className={cn('relative w-full', className)} onClick={onClick}>
      {/* 左侧图标：优先渲染消费方传入的 startAdornment，否则回退到 Search */}
      <div className="pointer-events-none absolute top-1/2 left-[var(--spacing-component)] flex -translate-y-1/2 items-center text-[var(--color-text-secondary)]">
        {startAdornment ?? <Search className="size-4" aria-hidden />}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Input
            autoComplete="new-password"
            spellCheck="false"
            autoFocus={autoFocus}
            placeholder={placeholder ?? t('shared.placeholders.filter')}
            value={text}
            onChange={handleChangeText}
            aria-invalid={!!effectiveErrorMessage}
            className={cn(
              'bg-[var(--color-bg-card)] pl-8 pr-28',
              effectiveErrorMessage && 'border-[var(--color-danger)]',
            )}
          />
        </TooltipTrigger>
        {effectiveErrorMessage && (
          <TooltipContent side="bottom" align="start">
            {effectiveErrorMessage}
          </TooltipContent>
        )}
      </Tooltip>

      {/* 右侧控制区：Clear + 三个开关 */}
      <div className="absolute top-1/2 right-[var(--spacing-inline)] flex -translate-y-1/2 items-center gap-inline">
        {!!text && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={toggleButtonClass}
                onClick={handleClearInput}
              >
                <X className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {t('shared.placeholders.resetInput')}
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={toggleButtonClass}
              onClick={handleToggleMatchCase}
            >
              <MatchCaseIcon
                className={toggleIconClass(matchCase)}
                aria-label={matchCase ? 'active' : 'inactive'}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('shared.placeholders.matchCase')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={toggleButtonClass}
              onClick={handleToggleMatchWholeWord}
            >
              <MatchWholeWordIcon
                className={toggleIconClass(matchWholeWord)}
                aria-label={matchWholeWord ? 'active' : 'inactive'}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {t('shared.placeholders.matchWholeWord')}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={toggleButtonClass}
              onClick={handleToggleUseRegularExpression}
            >
              <UseRegularExpressionIcon
                className={toggleIconClass(useRegularExpression)}
                aria-label={useRegularExpression ? 'active' : 'inactive'}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('shared.placeholders.useRegex')}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
