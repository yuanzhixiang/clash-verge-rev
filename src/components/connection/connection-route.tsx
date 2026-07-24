import { Fragment, type ReactNode } from 'react'

import { getConnectionChainPath } from './connection-route-utils'

export interface ConnectionRouteStep {
  label: string
  value?: string | null
}

export const ConnectionRouteChips = ({
  chains,
  empty,
}: {
  chains: string[]
  empty?: ReactNode
}) => {
  const path = getConnectionChainPath(chains)
  const keyedPath = path.map((node, index) => ({
    node,
    key: path.slice(0, index + 1).join(' -> '),
  }))

  if (!path.length) return empty

  return (
    <div
      title={path.join(' -> ')}
      className="flex min-w-0 max-w-full items-center gap-inline overflow-hidden"
    >
      {keyedPath.map(({ node, key }) => {
        const isExit = key === keyedPath[keyedPath.length - 1].key

        return (
          <Fragment key={key}>
            <span
              className={`box-border h-[22px] min-w-0 shrink truncate rounded-[var(--radius-compact)] border border-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] px-component text-[12px] font-semibold leading-5 text-[var(--color-accent)] ${
                isExit
                  ? 'max-w-[160px] bg-[color-mix(in_srgb,var(--color-accent)_13%,transparent)]'
                  : 'max-w-[140px] bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]'
              }`}
            >
              {node}
            </span>
            {!isExit && (
              <span className="shrink-0 text-[15px] leading-none text-[color-mix(in_srgb,var(--color-text-primary)_55%,transparent)]">
                -&gt;
              </span>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}

export const ConnectionRouteTimeline = ({
  steps,
}: {
  steps: ConnectionRouteStep[]
}) => {
  const visibleSteps = steps.filter((step) => step.value)

  if (!visibleSteps.length) return null

  return (
    <div className="flex flex-nowrap items-stretch gap-component overflow-x-auto overflow-y-hidden py-adjust">
      {visibleSteps.map((step) => {
        const isRemote = step === visibleSteps[visibleSteps.length - 1]

        return (
          <Fragment key={step.label}>
            <div
              title={`${step.label}: ${step.value}`}
              className="box-border min-w-[120px] max-w-[250px] shrink rounded-[var(--radius-compact)] border border-[color-mix(in_srgb,var(--color-accent)_26%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_3.5%,transparent)] px-2.5 py-compact"
            >
              <div className="text-[10px] font-bold leading-[1.25] text-[var(--color-accent)]">
                {step.label}
              </div>
              <div
                className={`truncate text-[12.5px] leading-[1.35] ${
                  isRemote
                    ? 'font-semibold text-[var(--color-accent)]'
                    : 'font-medium text-[var(--color-text-primary)]'
                }`}
              >
                {step.value}
              </div>
            </div>
            {!isRemote && (
              <div className="flex items-center px-px text-[20px] text-[color-mix(in_srgb,var(--color-text-primary)_60%,transparent)]">
                -&gt;
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
