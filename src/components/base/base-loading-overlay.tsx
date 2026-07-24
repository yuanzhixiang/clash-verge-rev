import { Loader2 } from 'lucide-react'

interface BaseLoadingOverlayProps {
  isLoading: boolean
}

export const BaseLoadingOverlay: React.FC<BaseLoadingOverlayProps> = ({
  isLoading,
}) => {
  if (!isLoading) return null

  return (
    <div className="absolute inset-0 z-[var(--z-modal)] flex items-center justify-center bg-white/70 dark:bg-black/50">
      <Loader2 className="animate-spin text-[var(--color-accent)]" />
    </div>
  )
}
