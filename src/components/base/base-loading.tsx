const dotClass =
  'size-1.5 m-0.5 rounded-full bg-[color:var(--color-text-secondary)] ' +
  'animate-[loading-dot_0.7s_-0.15s_infinite_linear] ' +
  '[&:nth-child(2n-1)]:[animation-delay:-0.5s]'

export const BaseLoading = () => {
  return (
    <div className="relative box-border flex h-full min-h-[18px] items-center">
      <div className={dotClass} />
      <div className={dotClass} />
      <div className={dotClass} />
    </div>
  )
}
