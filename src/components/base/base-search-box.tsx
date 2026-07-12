import { ClearRounded } from '@mui/icons-material'
import {
  Box,
  TextField,
  styled,
  IconButton,
  type SxProps,
  type Theme,
} from '@mui/material'
import Tooltip from '@mui/material/Tooltip'
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
  sx?: SxProps<Theme>
  onSearch: (match: (content: string) => boolean, state: SearchState) => void
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
}

const StyledTextField = styled(TextField)(({ theme }) => ({
  '& .MuiInputBase-root': {
    background: theme.palette.mode === 'light' ? '#fff' : undefined,
    paddingRight: '4px',
  },
  '& .MuiInputBase-input': {
    padding: '5.2px 10px',
  },
  "& .MuiInputBase-root svg[aria-label='active'] path": {
    fill: theme.palette.primary.light,
  },
  "& .MuiInputBase-root svg[aria-label='inactive'] path": {
    fill: '#A7A7A7',
  },
}))

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
  sx,
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

  const iconStyle = {
    height: '24px',
    width: '24px',
    cursor: 'pointer',
  } as React.CSSProperties

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

  return (
    <Tooltip title={effectiveErrorMessage || ''} placement="bottom-start">
      <StyledTextField
        autoComplete="new-password"
        hiddenLabel
        fullWidth
        size="small"
        variant="outlined"
        autoFocus={autoFocus}
        spellCheck="false"
        placeholder={placeholder ?? t('shared.placeholders.filter')}
        sx={sx}
        value={text}
        onClick={onClick}
        onChange={handleChangeText}
        error={!!effectiveErrorMessage}
        slotProps={{
          input: {
            sx: { pr: 1 },
            startAdornment: startAdornment ? (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  flex: '0 0 auto',
                  ml: 0.25,
                  mr: 0.25,
                  color: 'text.secondary',
                }}
              >
                {startAdornment}
              </Box>
            ) : undefined,
            endAdornment: (
              <Box sx={{ display: 'flex' }}>
                {!!text && (
                  <Tooltip title={t('shared.placeholders.resetInput')}>
                    <IconButton
                      size="small"
                      style={iconStyle}
                      onClick={handleClearInput}
                    >
                      <ClearRounded fontSize="inherit" />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title={t('shared.placeholders.matchCase')}>
                  <MatchCaseIcon
                    style={iconStyle}
                    aria-label={matchCase ? 'active' : 'inactive'}
                    onClick={handleToggleMatchCase}
                  />
                </Tooltip>
                <Tooltip title={t('shared.placeholders.matchWholeWord')}>
                  <MatchWholeWordIcon
                    style={iconStyle}
                    aria-label={matchWholeWord ? 'active' : 'inactive'}
                    onClick={handleToggleMatchWholeWord}
                  />
                </Tooltip>
                <Tooltip title={t('shared.placeholders.useRegex')}>
                  <UseRegularExpressionIcon
                    aria-label={useRegularExpression ? 'active' : 'inactive'}
                    style={iconStyle}
                    onClick={handleToggleUseRegularExpression}
                  />
                </Tooltip>
              </Box>
            ),
          },
        }}
      />
    </Tooltip>
  )
}
