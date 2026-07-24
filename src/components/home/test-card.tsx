import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { emit } from '@tauri-apps/api/event'
import { Gauge, Plus } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

// test icons
import apple from '@/assets/image/test/apple.svg?raw'
import github from '@/assets/image/test/github.svg?raw'
import google from '@/assets/image/test/google.svg?raw'
import youtube from '@/assets/image/test/youtube.svg?raw'
import { TestItem } from '@/components/test/test-item'
import { TestViewer, TestViewerRef } from '@/components/test/test-viewer'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useVerge } from '@/hooks/use-verge'

import { EnhancedCard } from './enhanced-card'

// 默认测试列表，移到组件外部避免重复创建
const DEFAULT_TEST_LIST = [
  {
    uid: nanoid(),
    name: 'Apple',
    url: 'https://www.apple.com',
    icon: apple,
  },
  {
    uid: nanoid(),
    name: 'GitHub',
    url: 'https://www.github.com',
    icon: github,
  },
  {
    uid: nanoid(),
    name: 'Google',
    url: 'https://www.google.com',
    icon: google,
  },
  {
    uid: nanoid(),
    name: 'YouTube',
    url: 'https://www.youtube.com',
    icon: youtube,
  },
]

export const TestCard = () => {
  const { t } = useTranslation()
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )
  const { verge, mutateVerge, patchVerge } = useVerge()
  const viewerRef = useRef<TestViewerRef>(null)

  // 使用useMemo优化测试列表，避免每次渲染重新计算
  const testList = useMemo(() => {
    return verge?.test_list ?? DEFAULT_TEST_LIST
  }, [verge?.test_list])

  // 使用useCallback优化函数引用，避免不必要的重新渲染
  const onTestListItemChange = useCallback(
    (uid: string, patch?: Partial<IVergeTestItem>) => {
      if (!patch) {
        mutateVerge()
        return
      }

      const newList = testList.map((x) =>
        x.uid === uid ? { ...x, ...patch } : x,
      )

      mutateVerge({ ...verge, test_list: newList }, false)
    },
    [testList, verge, mutateVerge],
  )

  const onDeleteTestListItem = useCallback(
    (uid: string) => {
      const newList = testList.filter((x) => x.uid !== uid)
      patchVerge({ test_list: newList })
      mutateVerge({ ...verge, test_list: newList }, false)
    },
    [testList, verge, patchVerge, mutateVerge],
  )

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const old_index = testList.findIndex((x) => x.uid === active.id)
      const new_index = testList.findIndex((x) => x.uid === over.id)

      if (old_index >= 0 && new_index >= 0) {
        const newList = [...testList]
        const [removed] = newList.splice(old_index, 1)
        newList.splice(new_index, 0, removed)

        // 优化：先本地更新，再异步 patch，避免UI卡死
        mutateVerge({ ...verge, test_list: newList }, false)
        const patchFn = () => {
          try {
            patchVerge({ test_list: newList })
          } catch {}
        }
        if (window.requestIdleCallback) {
          window.requestIdleCallback(patchFn)
        } else {
          setTimeout(patchFn, 0)
        }
      }
    },
    [testList, verge, mutateVerge, patchVerge],
  )

  // 仅在verge首次加载时初始化测试列表
  useEffect(() => {
    if (verge && !verge.test_list) {
      patchVerge({ test_list: DEFAULT_TEST_LIST })
    }
  }, [verge, patchVerge])

  // 使用useMemo优化UI内容，减少渲染计算
  const renderTestItems = useMemo(
    () => (
      <div className="grid grid-cols-4 gap-component">
        <SortableContext items={testList.map((x) => x.uid)}>
          {testList.map((item) => (
            <div key={item.uid}>
              <TestItem
                id={item.uid}
                itemData={item}
                onEdit={() => viewerRef.current?.edit(item)}
                onDelete={onDeleteTestListItem}
              />
            </div>
          ))}
        </SortableContext>
      </div>
    ),
    [testList, onDeleteTestListItem],
  )

  const handleTestAll = useCallback(() => {
    emit('verge://test-all')
  }, [])

  const handleCreateTest = useCallback(() => {
    viewerRef.current?.create()
  }, [])

  return (
    <EnhancedCard
      title={t('home.components.tests.title')}
      icon={<Gauge className="size-5" />}
      action={
        <div className="flex gap-component">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={handleTestAll}>
                <Gauge className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('tests.page.actions.testAll')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={handleCreateTest}>
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t('tests.modals.test.title.create')}
            </TooltipContent>
          </Tooltip>
        </div>
      }
    >
      <div className="max-h-45 overflow-x-hidden overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-[var(--radius-compact)] [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--color-text-primary)_20%,transparent)]">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          {renderTestItems}
          <DragOverlay />
        </DndContext>
      </div>

      <TestViewer ref={viewerRef} onChange={onTestListItemChange} />
    </EnhancedCard>
  )
}
