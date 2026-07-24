import { useRef } from 'react'

import { DialogRef } from '@/components/base'
import { Button } from '@/components/ui/button'
import { useUpdate } from '@/hooks/use-update'

import { UpdateViewer } from '../setting/mods/update-viewer'

interface Props {
  className?: string
}

export const UpdateButton = (props: Props) => {
  const { className } = props
  const viewerRef = useRef<DialogRef>(null)

  const { updateInfo } = useUpdate()

  if (!updateInfo?.available) return null

  return (
    <>
      <UpdateViewer ref={viewerRef} />

      <Button
        variant="destructive"
        size="sm"
        className={className}
        onClick={() => viewerRef.current?.open()}
      >
        New
      </Button>
    </>
  )
}
