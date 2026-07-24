import { Bug, CircleAlert, RefreshCw } from 'lucide-react'
import React, { Component, ErrorInfo, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallbackComponent?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  showDetails: boolean
}

/**
 * 流量统计专用错误边界组件
 * 处理图表和流量统计组件的错误，提供优雅的降级体验
 */
export class TrafficErrorBoundary extends Component<Props, State> {
  private retryCount = 0
  private maxRetries = 3

  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // 更新状态以显示降级UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[TrafficErrorBoundary] 捕获到组件错误:', error, errorInfo)

    this.setState({
      error,
      errorInfo,
    })

    // 调用错误回调
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // 发送错误到监控系统（如果有的话）
    this.reportError(error, errorInfo)
  }

  private reportError = (error: Error, errorInfo: ErrorInfo) => {
    // 这里可以集成错误监控服务
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    }

    console.error('[TrafficErrorBoundary] 错误报告:', errorReport)
    // TODO: 发送到错误监控服务
    // sendErrorReport(errorReport);
  }

  private handleRetry = () => {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++
      console.log(
        `[TrafficErrorBoundary] 尝试重试 (${this.retryCount}/${this.maxRetries})`,
      )

      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        showDetails: false,
      })
    } else {
      console.warn('[TrafficErrorBoundary] 已达到最大重试次数')
    }
  }

  private handleRefresh = () => {
    window.location.reload()
  }

  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }))
  }

  render() {
    if (this.state.hasError) {
      // 如果提供了自定义降级组件，使用它
      if (this.props.fallbackComponent) {
        return this.props.fallbackComponent
      }

      // 默认错误UI
      return (
        <TrafficErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          showDetails={this.state.showDetails}
          canRetry={this.retryCount < this.maxRetries}
          retryCount={this.retryCount}
          maxRetries={this.maxRetries}
          onRetry={this.handleRetry}
          onRefresh={this.handleRefresh}
          onToggleDetails={this.toggleDetails}
        />
      )
    }

    return this.props.children
  }
}

/**
 * 错误降级UI组件
 */
interface TrafficErrorFallbackProps {
  error: Error | null
  errorInfo: ErrorInfo | null
  showDetails: boolean
  canRetry: boolean
  retryCount: number
  maxRetries: number
  onRetry: () => void
  onRefresh: () => void
  onToggleDetails: () => void
}

const TrafficErrorFallback: React.FC<TrafficErrorFallbackProps> = ({
  error,
  errorInfo,
  showDetails,
  canRetry,
  retryCount,
  maxRetries,
  onRetry,
  onRefresh,
  onToggleDetails,
}) => {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center rounded-[var(--radius-container)] border border-dashed border-[var(--color-danger)] bg-[var(--color-danger-subtle)] p-inset text-[var(--color-danger)]">
      <CircleAlert className="mb-inset size-12 text-[var(--color-danger)]" />

      <h3 className="mb-component text-h3 font-semibold">
        {t('shared.feedback.errors.trafficStats')}
      </h3>

      <p className="mb-inset text-center text-body text-[var(--color-text-secondary)]">
        {t('shared.feedback.errors.trafficStatsDescription')}
      </p>

      <div className="mb-inset w-full max-w-[400px] rounded-[var(--radius-compact)] border border-[color-mix(in_srgb,var(--color-danger)_25%,transparent)] bg-[var(--color-danger-subtle)] p-component">
        <p className="text-body">
          <strong>Error:</strong>{' '}
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
        {retryCount > 0 && (
          <p className="mt-component block text-caption">
            {t('shared.labels.retryAttempts')}: {retryCount}/{maxRetries}
          </p>
        )}
      </div>

      <div className="mb-inset flex gap-component">
        {canRetry && (
          <Button size="sm" onClick={onRetry}>
            <RefreshCw />
            {t('shared.actions.retry')}
          </Button>
        )}

        <Button variant="outline" size="sm" onClick={onRefresh}>
          {t('shared.actions.refreshPage')}
        </Button>

        <Button variant="ghost" size="sm" onClick={onToggleDetails}>
          <Bug />
          {showDetails
            ? t('shared.actions.hideDetails')
            : t('shared.actions.showDetails')}
        </Button>
      </div>

      {showDetails && (
        <div className="w-full max-w-[600px] animate-in fade-in duration-[var(--duration-base)]">
          <div className="rounded-[var(--radius-compact)] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-inset text-[var(--color-text-primary)]">
            <p className="mb-component text-label font-semibold">
              Error Details:
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-caption text-[var(--color-text-secondary)]">
              {error?.stack}
            </pre>

            {errorInfo?.componentStack && (
              <>
                <p className="mt-inset mb-component text-label font-semibold">
                  Component Stack:
                </p>
                <pre className="whitespace-pre-wrap break-words font-mono text-caption text-[var(--color-text-secondary)]">
                  {errorInfo.componentStack}
                </pre>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 轻量级流量统计错误边界
 * 用于小型流量显示组件，提供最小化的错误UI
 */
export const LightweightTrafficErrorBoundary: React.FC<{
  children: ReactNode
}> = ({ children }) => {
  return (
    <TrafficErrorBoundary
      fallbackComponent={
        <div className="flex min-h-[60px] items-center justify-center rounded-[var(--radius-compact)] bg-[var(--color-danger-subtle)] p-component text-[var(--color-danger)]">
          <CircleAlert className="mr-component size-5" />
          <span className="text-caption">Traffic data unavailable</span>
        </div>
      }
    >
      {children}
    </TrafficErrorBoundary>
  )
}
