import React, { ReactNode } from 'react'

import { BaseErrorBoundary } from './base-error-boundary'

interface Props {
  title?: React.ReactNode // the page title
  header?: React.ReactNode // something behind title
  contentStyle?: React.CSSProperties
  children?: ReactNode
  full?: boolean
}

export const BasePage: React.FC<Props> = (props) => {
  const { title, header, contentStyle, full, children } = props
  return (
    <BaseErrorBoundary>
      <div className="base-page">
        <header data-tauri-drag-region="true" style={{ userSelect: 'none' }}>
          <h1
            className="text-2xl sm:text-3xl font-[650] leading-[1.15] tracking-[-0.035em]"
            data-tauri-drag-region="true"
          >
            {title}
          </h1>

          {header}
        </header>

        <div
          className={full ? 'base-container no-padding' : 'base-container'}
          style={{ backgroundColor: 'var(--shell-panel)' }}
        >
          <section style={{ backgroundColor: 'var(--shell-panel)' }}>
            <div className="base-content" style={contentStyle}>
              {children}
            </div>
          </section>
        </div>
      </div>
    </BaseErrorBoundary>
  )
}
