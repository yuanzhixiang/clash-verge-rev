import { Copy, Minus, Square, X } from 'lucide-react'
import {
  forwardRef,
  type PointerEvent,
  useCallback,
  useImperativeHandle,
} from 'react'

import { Button } from '@/components/ui/button'
import { useWindowControls } from '@/hooks/use-window'
import getSystem from '@/utils/get-system'

const RESIZE_HANDLES = [
  { direction: 'North', position: 'north' },
  { direction: 'NorthEast', position: 'north-east' },
  { direction: 'East', position: 'east' },
  { direction: 'SouthEast', position: 'south-east' },
  { direction: 'South', position: 'south' },
  { direction: 'SouthWest', position: 'south-west' },
  { direction: 'West', position: 'west' },
  { direction: 'NorthWest', position: 'north-west' },
] as const

export const WindowResizeHandles = () => {
  const { currentWindow, maximized } = useWindowControls()

  const startResizeDragging = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return

      event.preventDefault()
      const direction = event.currentTarget.dataset.resizeDirection
      const handle = RESIZE_HANDLES.find((item) => item.direction === direction)

      if (handle) {
        void currentWindow
          .startResizeDragging(handle.direction)
          .catch((error) =>
            console.warn('[WindowResizeHandles] 调整窗口大小失败:', error),
          )
      }
    },
    [currentWindow],
  )

  if (getSystem() !== 'linux' || maximized) return null

  return (
    <div
      className="window-resize-handles"
      data-tauri-drag-region="false"
      aria-hidden="true"
    >
      {RESIZE_HANDLES.map(({ direction, position }) => (
        <div
          key={direction}
          className={`window-resize-handle window-resize-handle--${position}`}
          data-resize-direction={direction}
          onPointerDown={startResizeDragging}
        />
      ))}
    </div>
  )
}

export const WindowControls = forwardRef(function WindowControls(props, ref) {
  const OS = getSystem()
  const {
    currentWindow,
    maximized,
    minimize,
    close,
    toggleFullscreen,
    toggleMaximize,
  } = useWindowControls()

  useImperativeHandle(
    ref,
    () => ({
      currentWindow,
      maximized,
      minimize,
      close,
      toggleFullscreen,
      toggleMaximize,
    }),
    [
      currentWindow,
      maximized,
      minimize,
      close,
      toggleFullscreen,
      toggleMaximize,
    ],
  )

  // 通过前端对 tauri 窗口进行翻转全屏时会短暂地与系统图标重叠渲染。
  // 这可能是上游缺陷，保险起见跨平台以窗口的最大化翻转为准。

  return (
    <div className="flex items-center gap-component [&>button]:cursor-default">
      {OS === 'macos' && (
        <>
          {/* macOS 风格：关闭 → 最小化 → 全屏 */}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-full"
            onClick={close}
          >
            <X className="size-[14px]" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-full"
            onClick={minimize}
          >
            <Minus className="size-[14px]" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-full"
            onClick={toggleMaximize}
          >
            {maximized ? (
              <Copy className="size-[14px]" />
            ) : (
              <Square className="size-[14px]" />
            )}
          </Button>
        </>
      )}

      {OS === 'windows' && (
        <>
          {/* Windows 风格：最小化 → 最大化 → 关闭 */}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-full"
            onClick={minimize}
          >
            <Minus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-full"
            onClick={toggleMaximize}
          >
            {maximized ? (
              <Copy className="size-4" />
            ) : (
              <Square className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-full hover:bg-[var(--color-danger)] hover:text-[var(--color-text-on-accent)]"
            onClick={close}
          >
            <X className="size-4" />
          </Button>
        </>
      )}

      {OS === 'linux' && (
        <>
          {/* Linux 桌面常见布局（GNOME/KDE 多为：最小化 → 最大化 → 关闭） */}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-full"
            onClick={minimize}
          >
            <Minus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-full"
            onClick={toggleMaximize}
          >
            {maximized ? (
              <Copy className="size-4" />
            ) : (
              <Square className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-full hover:bg-[var(--color-danger)] hover:text-[var(--color-text-on-accent)]"
            onClick={close}
          >
            <X className="size-4" />
          </Button>
        </>
      )}
    </div>
  )
})
