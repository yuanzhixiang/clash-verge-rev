import { FeaturedPlayListRounded, MoreHorizRounded } from '@mui/icons-material'
import {
  Box,
  Badge,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EditorViewer } from '@/components/profile/editor-viewer'
import { useEditorDocument } from '@/hooks/use-editor-document'
import {
  readProfileFile,
  revealProfileFile,
  saveProfileFile,
  viewProfile,
} from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

import { LogViewer } from './log-viewer'
import { ProfileBox } from './profile-box'

interface Props {
  logInfo?: [string, string][]
  id: 'Merge' | 'Script'
  onSave?: (prev?: string, curr?: string) => void
}

const EMPTY_LOG_INFO: [string, string][] = []

// Default global extend script content (mirrors `ITEM_SCRIPT` in
// src-tauri/src/utils/tmpl.rs).
const DEFAULT_SCRIPT = `// Define main function (script entry)

function main(config, profileName) {
  return config;
}
`

// profile enhanced item
export const ProfileMore = (props: Props) => {
  const { id, logInfo, onSave } = props

  const entries = logInfo ?? EMPTY_LOG_INFO
  const { t } = useTranslation()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const [fileOpen, setFileOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)

  const loadDocument = useCallback(() => readProfileFile(id), [id])
  const document = useEditorDocument({
    open: fileOpen,
    load: loadDocument,
  })

  const onEditFile = () => {
    setAnchorEl(null)
    setFileOpen(true)
  }

  const onOpenFile = useLockFn(async () => {
    setAnchorEl(null)
    try {
      await viewProfile(id)
    } catch (err) {
      showNotice.error(err)
    }
  })

  const onRevealFile = useLockFn(async () => {
    setAnchorEl(null)
    try {
      await revealProfileFile(id)
    } catch (err) {
      showNotice.error(err)
    }
  })

  const hasError = entries.some(([level]) => level === 'exception')

  const globalTitles: Record<Props['id'], string> = {
    Merge: 'profiles.components.more.global.merge',
    Script: 'profiles.components.more.global.script',
  }

  const chipLabels: Record<Props['id'], string> = {
    Merge: 'profiles.components.more.chips.merge',
    Script: 'profiles.components.more.chips.script',
  }

  const itemMenu = [
    { label: 'profiles.components.menu.editFile', handler: onEditFile },
    { label: 'profiles.components.menu.openFile', handler: onOpenFile },
    {
      label: 'profiles.components.menu.revealInFinder',
      handler: onRevealFile,
    },
  ]

  const handleSave = useLockFn(async () => {
    const currentValue = document.value
    if (!(await saveProfileFile(id, currentValue))) {
      await document.reload()
      return
    }
    onSave?.(document.savedValue, currentValue)
    document.markSaved(currentValue)
  })

  const handleResetToDefault = useCallback(() => {
    document.setValue(DEFAULT_SCRIPT)
  }, [document])

  return (
    <>
      <ProfileBox
        onDoubleClick={onEditFile}
        onContextMenu={(event) => {
          const { clientX, clientY } = event
          setPosition({ top: clientY, left: clientX })
          setAnchorEl(event.currentTarget as HTMLElement)
          event.preventDefault()
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto auto',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="h2"
              noWrap
              title={t(globalTitles[id])}
              sx={{ fontSize: 14, fontWeight: 550, lineHeight: 1.35 }}
            >
              {t(globalTitles[id])}
            </Typography>
            <Typography
              color="text.secondary"
              sx={{ mt: 0.25, fontSize: 11.5, lineHeight: 1.4 }}
            >
              {t(chipLabels[id])}
            </Typography>
          </Box>

          {id === 'Script' &&
            (hasError ? (
              <Badge color="error" variant="dot" overlap="circular">
                <IconButton
                  size="small"
                  edge="start"
                  color="error"
                  title={t('profiles.modals.logViewer.title')}
                  onClick={() => setLogOpen(true)}
                >
                  <FeaturedPlayListRounded fontSize="inherit" />
                </IconButton>
              </Badge>
            ) : (
              <IconButton
                size="small"
                edge="start"
                color="inherit"
                title={t('profiles.modals.logViewer.title')}
                onClick={() => setLogOpen(true)}
              >
                <FeaturedPlayListRounded fontSize="inherit" />
              </IconButton>
            ))}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Chip
              label={t(chipLabels[id])}
              size="small"
              sx={{ height: 20, color: 'text.secondary' }}
            />
            <IconButton
              size="small"
              title={t('shared.actions.showDetails')}
              sx={{ ml: 0.5, color: 'text.secondary' }}
              onClick={(event) => {
                event.stopPropagation()
                const rect = event.currentTarget.getBoundingClientRect()
                setPosition({ top: rect.bottom, left: rect.right })
                setAnchorEl(event.currentTarget)
              }}
            >
              <MoreHorizRounded fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      </ProfileBox>

      <Menu
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorPosition={position}
        anchorReference="anchorPosition"
        transitionDuration={225}
        slotProps={{ list: { sx: { py: 0.5 } } }}
        onContextMenu={(e) => {
          setAnchorEl(null)
          e.preventDefault()
        }}
      >
        {itemMenu
          .filter((item: any) => item.show !== false)
          .map((item) => (
            <MenuItem
              key={item.label}
              onClick={item.handler}
              sx={[
                { minWidth: 120 },
                (theme) => {
                  return {
                    color:
                      item.label === 'Delete'
                        ? theme.palette.error.main
                        : undefined,
                  }
                },
              ]}
              dense
            >
              {t(item.label)}
            </MenuItem>
          ))}
      </Menu>
      {fileOpen && (
        <EditorViewer
          open={true}
          title={t(globalTitles[id])}
          value={document.value}
          language={id === 'Merge' ? 'yaml' : 'javascript'}
          path={`profile-more:${id}.${id === 'Merge' ? 'yaml' : 'js'}`}
          loading={document.loading}
          dirty={document.dirty}
          onChange={document.setValue}
          onSave={handleSave}
          onResetToDefault={id === 'Script' ? handleResetToDefault : undefined}
          onClose={() => setFileOpen(false)}
        />
      )}
      {logOpen && (
        <LogViewer
          open={logOpen}
          logInfo={entries}
          onClose={() => setLogOpen(false)}
        />
      )}
    </>
  )
}
