import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast, type ExternalToast } from 'sonner'

import {
  subscribeNotices,
  hideNotice,
  getSnapshotNotices,
  showNotice,
} from '@/services/notice-service'
import type { TranslationKey } from '@/types/generated/i18n-keys'

type NoticePosition = NonNullable<IVergeConfig['notice_position']>
type NoticeItem = ReturnType<typeof getSnapshotNotices>[number]
type NoticeType = NoticeItem['type']
type TranslationFn = ReturnType<typeof useTranslation>['t']

const VALID_POSITIONS: NoticePosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]

const resolvePosition = (position?: NoticePosition | null): NoticePosition => {
  if (position && VALID_POSITIONS.includes(position)) {
    return position
  }
  return 'top-right'
}

// Stable, non-numeric sonner ids: numeric `0` is falsy and would make
// `toast.dismiss(0)` dismiss *every* toast, so we namespace them as strings.
const toastKey = (id: number): string => `notice-${id}`

// Route a store notice type to its matching sonner toast helper.
const emitToast = (
  type: NoticeType,
  message: React.ReactNode,
  options: ExternalToast,
): string | number => {
  switch (type) {
    case 'success':
      return toast.success(message, options)
    case 'error':
      return toast.error(message, options)
    case 'warning':
      return toast.warning(message, options)
    case 'info':
    default:
      return toast.info(message, options)
  }
}

const resolveNoticeMessage = (
  notice: NoticeItem,
  t: TranslationFn,
): React.ReactNode => {
  const i18n = notice.i18n
  if (!i18n) return notice.message

  const params = (i18n.params ?? {}) as Record<string, unknown>
  const { prefixKey, prefixParams, prefix, message, ...restParams } = params

  const prefixKeyParams =
    prefixParams && typeof prefixParams === 'object'
      ? (prefixParams as Record<string, unknown>)
      : undefined

  const resolvedPrefix =
    typeof prefixKey === 'string'
      ? t(prefixKey as TranslationKey, {
          defaultValue: prefixKey,
          ...(prefixKeyParams ?? {}),
          ...restParams,
        })
      : typeof prefix === 'string'
        ? prefix
        : undefined

  const messageStr = typeof message === 'string' ? message : undefined

  const defaultValue =
    messageStr === undefined
      ? undefined
      : resolvedPrefix
        ? `${resolvedPrefix} ${messageStr}`
        : messageStr

  return t(i18n.key as TranslationKey, {
    defaultValue,
    ...restParams,
    ...(resolvedPrefix !== undefined ? { prefix: resolvedPrefix } : {}),
    ...(messageStr !== undefined ? { message: messageStr } : {}),
  })
}

const extractNoticeCopyText = (input: unknown): string | undefined => {
  if (input === null || input === undefined) return undefined
  if (typeof input === 'string') return input
  if (typeof input === 'number' || typeof input === 'boolean') {
    return String(input)
  }
  if (input instanceof Error) {
    return input.message || input.name
  }
  if (React.isValidElement(input)) return undefined
  if (typeof input === 'object') {
    const maybeMessage = (input as { message?: unknown }).message
    if (typeof maybeMessage === 'string') return maybeMessage
  }
  try {
    return JSON.stringify(input)
  } catch {
    return String(input)
  }
}

const resolveNoticeCopyText = (
  notice: NoticeItem,
  t: TranslationFn,
): string | undefined => {
  if (
    notice.i18n?.key === 'shared.feedback.notices.prefixedRaw' ||
    notice.i18n?.key === 'shared.feedback.notices.raw'
  ) {
    const rawText = extractNoticeCopyText(notice.i18n?.params?.message)
    if (rawText) return rawText
  }

  return (
    extractNoticeCopyText(resolveNoticeMessage(notice, t)) ??
    extractNoticeCopyText(notice.message)
  )
}

interface NoticeManagerProps {
  position?: NoticePosition | null
}

/**
 * Bridges the notice store to sonner. The store remains the single source of
 * truth (it owns each notice's auto-dismiss timer, or keeps it persistent when
 * `duration === 0`), so this component only mirrors the store into sonner:
 * new notices are emitted as toasts, removed notices are dismissed, and toasts
 * closed by the user are pushed back into the store via `hideNotice`.
 * The actual `<Toaster />` is mounted once at the app root (see main.tsx).
 */
export const NoticeManager: React.FC<NoticeManagerProps> = ({ position }) => {
  const { t } = useTranslation()
  const resolvedPosition = useMemo(() => resolvePosition(position), [position])
  const currentNotices = useSyncExternalStore(
    subscribeNotices,
    getSnapshotNotices,
  )

  const handleNoticeCopy = useCallback(
    async (notice: NoticeItem) => {
      const text = resolveNoticeCopyText(notice, t)
      if (!text) return
      try {
        await navigator.clipboard.writeText(text)
        showNotice.success(
          'shared.feedback.notifications.common.copySuccess',
          1000,
        )
      } catch (error) {
        console.warn('[NoticeManager] copy to clipboard failed:', error)
      }
    },
    [t],
  )

  // Ids we have already handed to sonner, so store re-renders stay idempotent.
  const shownIdsRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    const activeIds = new Set(currentNotices.map((notice) => notice.id))

    // Emit toasts for notices that just entered the store.
    for (const notice of currentNotices) {
      if (shownIdsRef.current.has(notice.id)) continue
      shownIdsRef.current.add(notice.id)

      const content = (
        <span
          className="block w-full"
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void handleNoticeCopy(notice)
          }}
        >
          {resolveNoticeMessage(notice, t)}
        </span>
      )

      emitToast(notice.type, content, {
        id: toastKey(notice.id),
        position: resolvedPosition,
        // The store owns lifecycle/timers; never let sonner auto-close on its
        // own or the two timers would race. Store timers drive dismissal below.
        duration: Infinity,
        closeButton: true,
        // Keep the store in sync when the user closes or swipes the toast.
        onDismiss: () => hideNotice(notice.id),
      })
    }

    // Dismiss toasts whose notices were removed from the store (timer or manual).
    for (const id of shownIdsRef.current) {
      if (activeIds.has(id)) continue
      shownIdsRef.current.delete(id)
      toast.dismiss(toastKey(id))
    }
  }, [currentNotices, resolvedPosition, t, handleNoticeCopy])

  return null
}
