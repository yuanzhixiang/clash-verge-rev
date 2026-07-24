import { relaunch } from '@tauri-apps/plugin-process'
import { open as openUrl } from '@tauri-apps/plugin-shell'
import type { DownloadEvent } from '@tauri-apps/plugin-updater'
import { useLockFn } from 'ahooks'
import { Loader2 } from 'lucide-react'
import { useTheme } from 'next-themes'
import type { Ref } from 'react'
import {
  lazy,
  Suspense,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { Options as ReactMarkdownOptions } from 'react-markdown'

import { BaseDialog, DialogRef } from '@/components/base'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useUpdate } from '@/hooks/use-update'
import { cn } from '@/lib/utils'
import { showNotice } from '@/services/notice-service'
import { useSetUpdateState, useUpdateState } from '@/services/states'

type MarkdownNode = {
  type: string
  value?: string
  children?: MarkdownNode[]
  data?: {
    hProperties?: Record<string, unknown>
  }
}

const GITHUB_ALERTS = {
  note: { label: 'Note', color: '#0969da' },
  tip: { label: 'Tip', color: '#1a7f37' },
  important: { label: 'Important', color: '#8250df' },
  warning: { label: 'Warning', color: '#9a6700' },
  caution: { label: 'Caution', color: '#cf222e' },
} as const

type GitHubAlertType = keyof typeof GITHUB_ALERTS

const GITHUB_ALERT_PATTERN =
  /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][\t ]*\n?/i
const GITHUB_ALERT_CLASS_PATTERN =
  /markdown-alert-(note|tip|important|warning|caution)/

const LazyReactMarkdown = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: rehypeRaw }] =
    await Promise.all([import('react-markdown'), import('rehype-raw')])

  return {
    default: (props: ReactMarkdownOptions) => (
      <ReactMarkdown {...props} rehypePlugins={[rehypeRaw]} />
    ),
  }
})

const getAlertTypeFromClassName = (
  className: unknown,
): GitHubAlertType | null => {
  const value = Array.isArray(className)
    ? className.join(' ')
    : typeof className === 'string'
      ? className
      : ''
  const match = value.match(GITHUB_ALERT_CLASS_PATTERN)
  return match?.[1] as GitHubAlertType | null
}

const findFirstTextNode = (node: MarkdownNode): MarkdownNode | null => {
  if (node.type === 'text') return node
  for (const child of node.children ?? []) {
    const result = findFirstTextNode(child)
    if (result) return result
  }
  return null
}

const remarkGitHubAlerts = () => {
  const visit = (node: MarkdownNode) => {
    for (const child of node.children ?? []) {
      visit(child)
    }

    if (node.type !== 'blockquote') return

    const firstTextNode = findFirstTextNode(node)
    const match = firstTextNode?.value?.match(GITHUB_ALERT_PATTERN)
    if (!firstTextNode?.value || !match) return

    const alertType = match[1].toLowerCase() as GitHubAlertType
    firstTextNode.value = firstTextNode.value
      .replace(GITHUB_ALERT_PATTERN, '')
      .replace(/^\n+/, '')

    node.data = {
      ...(node.data ?? {}),
      hProperties: {
        ...(node.data?.hProperties ?? {}),
        className: ['markdown-alert', `markdown-alert-${alertType}`],
      },
    }

    node.children?.unshift({
      type: 'paragraph',
      data: {
        hProperties: {
          className: 'markdown-alert-title',
        },
      },
      children: [
        {
          type: 'text',
          value: GITHUB_ALERTS[alertType].label,
        },
      ],
    })
  }

  return visit
}

// react-markdown 渲染出的后代元素排版：用 Tailwind 任意后代变体表达，
// 颜色全部走语义 token。
const MARKDOWN_CLASS = cn(
  'min-h-0 flex-1 overflow-auto break-words pr-stack -mr-component',
  'text-body text-[var(--color-text-primary)]',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_h1]:mt-0 [&_h1]:mb-stack [&_h1]:text-h1',
  '[&_h2]:mt-inset [&_h2]:mb-component [&_h2]:text-h2',
  '[&_h3]:mt-inset [&_h3]:mb-compact [&_h3]:text-h3',
  '[&_:is(h4,h5,h6)]:mt-stack [&_:is(h4,h5,h6)]:mb-compact [&_:is(h4,h5,h6)]:text-body [&_:is(h4,h5,h6)]:font-semibold',
  '[&_p]:my-component',
  '[&_:is(ul,ol)]:my-component [&_:is(ul,ol)]:pl-block',
  '[&_li]:my-adjust',
  '[&_a]:text-[var(--color-accent)] [&_a]:[overflow-wrap:anywhere]',
  '[&_strong]:font-bold',
  '[&_code]:px-inline [&_code]:py-px [&_code]:rounded-[var(--radius-compact)] [&_code]:bg-[var(--color-bg-hover)] [&_code]:text-[0.92em]',
  '[&_pre]:my-stack [&_pre]:p-stack [&_pre]:overflow-auto [&_pre]:rounded-[var(--radius-compact)] [&_pre]:bg-[var(--color-bg-hover)]',
  '[&_pre_code]:p-0 [&_pre_code]:bg-transparent [&_pre_code]:text-[0.9em]',
  '[&_table]:block [&_table]:w-full [&_table]:my-stack [&_table]:overflow-x-auto [&_table]:border-collapse',
  '[&_:is(th,td)]:px-component [&_:is(th,td)]:py-compact [&_:is(th,td)]:border [&_:is(th,td)]:border-[var(--color-border)] [&_:is(th,td)]:align-top',
  '[&_th]:bg-[var(--color-bg-hover)] [&_th]:font-bold',
  '[&_hr]:my-inset [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-[var(--color-border)]',
  '[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-[var(--radius-compact)]',
  '[&_blockquote:not(.markdown-alert)]:mt-stack [&_blockquote:not(.markdown-alert)]:mb-inset [&_blockquote:not(.markdown-alert)]:pl-inset [&_blockquote:not(.markdown-alert)]:text-[var(--color-text-secondary)] [&_blockquote:not(.markdown-alert)]:border-l-4 [&_blockquote:not(.markdown-alert)]:border-[var(--color-border)]',
)

export function UpdateViewer({ ref }: { ref?: Ref<DialogRef> }) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const [open, setOpen] = useState(false)
  const updateState = useUpdateState()
  const setUpdateState = useSetUpdateState()

  const { updateInfo } = useUpdate()

  const [downloaded, setDownloaded] = useState(0)
  const [total, setTotal] = useState(0)
  const downloadedRef = useRef(0)
  const totalRef = useRef(0)

  const progress = useMemo(() => {
    if (total <= 0) return 0
    return Math.min((downloaded / total) * 100, 100)
  }, [downloaded, total])

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
  }))

  const markdownContent = useMemo(() => {
    if (!updateInfo?.body) {
      return 'New Version is available'
    }
    return updateInfo?.body
  }, [updateInfo])

  const breakChangeFlag = useMemo(() => {
    if (!updateInfo?.body) {
      return false
    }
    return updateInfo?.body.toLowerCase().includes('break change')
  }, [updateInfo])

  const onUpdate = useLockFn(async () => {
    if (!updateInfo?.body) return
    if (breakChangeFlag) {
      showNotice.error('settings.modals.update.messages.breakChangeError')
      return
    }
    if (updateState) return
    setUpdateState(true)
    setDownloaded(0)
    setTotal(0)
    downloadedRef.current = 0
    totalRef.current = 0

    const onDownloadEvent = (event: DownloadEvent) => {
      if (event.event === 'Started') {
        const contentLength = event.data.contentLength ?? 0
        totalRef.current = contentLength
        setTotal(contentLength)
        setDownloaded(0)
        downloadedRef.current = 0
        return
      }

      if (event.event === 'Progress') {
        setDownloaded((prev) => {
          const next = prev + event.data.chunkLength
          downloadedRef.current = next
          return next
        })
      }

      if (event.event === 'Finished' && totalRef.current === 0) {
        totalRef.current = downloadedRef.current
        setTotal(downloadedRef.current)
      }
    }

    try {
      await updateInfo.downloadAndInstall(onDownloadEvent)
      await relaunch()
    } catch (err: any) {
      showNotice.error(err)
    } finally {
      setUpdateState(false)
      setDownloaded(0)
      setTotal(0)
      downloadedRef.current = 0
      totalRef.current = 0
    }
  })

  return (
    <BaseDialog
      open={open}
      title={
        <div className="flex items-center justify-between gap-inset min-w-0">
          <span className="min-w-0 truncate">
            {t('settings.modals.update.title', {
              version: updateInfo?.version ?? '',
            })}
          </span>
          <Button
            size="sm"
            className="whitespace-nowrap"
            onClick={() => {
              openUrl(
                `https://github.com/clash-verge-rev/clash-verge-rev/releases/tag/v${updateInfo?.version}`,
              )
            }}
          >
            {t('settings.modals.update.actions.goToRelease')}
          </Button>
        </div>
      }
      contentSx={{
        width: { xs: 'calc(100vw - 56px)', sm: 560 },
        maxWidth: 'calc(100vw - 56px)',
        height: 'min(64vh, 680px)',
        display: 'flex',
        flexDirection: 'column',
        pb: 1,
      }}
      okBtn={t('settings.modals.update.actions.update')}
      cancelBtn={t('shared.actions.cancel')}
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
      onOk={onUpdate}
    >
      <div className={MARKDOWN_CLASS}>
        {open && (
          <Suspense
            fallback={
              <div className="flex justify-center py-inset">
                <Loader2 className="size-6 animate-spin text-[var(--color-text-muted)]" />
              </div>
            }
          >
            <LazyReactMarkdown
              remarkPlugins={[remarkGitHubAlerts]}
              components={{
                a: ({ ...props }) => {
                  const { children } = props
                  return (
                    <a {...props} target="_blank" rel="noreferrer">
                      {children}
                    </a>
                  )
                },
                blockquote: ({ className, children }) => {
                  const alertType = getAlertTypeFromClassName(className)

                  if (!alertType) {
                    return (
                      <blockquote className={className}>{children}</blockquote>
                    )
                  }

                  const color = GITHUB_ALERTS[alertType].color
                  const background = `color-mix(in srgb, ${color} ${
                    isDark ? 16 : 8
                  }%, transparent)`

                  return (
                    <blockquote
                      className={cn(
                        className,
                        'mt-stack mb-inset px-inset py-component rounded-[var(--radius-compact)] border-l-4',
                        '[&_p]:my-compact',
                        '[&_.markdown-alert-title]:flex [&_.markdown-alert-title]:items-center [&_.markdown-alert-title]:gap-compact [&_.markdown-alert-title]:font-bold [&_.markdown-alert-title]:leading-[1.4]',
                      )}
                      style={{ borderLeftColor: color, background }}
                    >
                      {children}
                    </blockquote>
                  )
                },
              }}
            >
              {markdownContent}
            </LazyReactMarkdown>
          </Suspense>
        )}
      </div>
      {updateState && <Progress value={progress} className="mt-component" />}
    </BaseDialog>
  )
}
