import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(appDir, '../..')
const notebookAppSource = readFileSync(join(appDir, './NotebookApp.tsx'), 'utf8')
const appCssSource = readFileSync(join(appDir, '../App.css'), 'utf8')
const iconSource = readFileSync(join(appDir, '../icons/app-icons.ts'), 'utf8')
const electronApiSource = readFileSync(join(repoRoot, 'src/types/electron-api.d.ts'), 'utf8')
const preloadSource = readFileSync(join(repoRoot, 'electron/preload.cjs'), 'utf8')
const ipcStorageSource = readFileSync(join(repoRoot, 'electron/ipc-storage.mjs'), 'utf8')

describe('notebook sidebar tree', () => {
  it('renders a file-tree style sidebar without data transfer actions', () => {
    expect(notebookAppSource).toContain("const folderIconId = isFolder && !collapsed && children.length > 0 ? 'folderOpen' : 'folder'")
    expect(notebookAppSource).toContain('className="notebook-tree-folder-icon"')
    expect(notebookAppSource).not.toContain("'chevronRight'")
    expect(notebookAppSource).not.toContain("'chevronDown'")
    expect(notebookAppSource).not.toContain("'fileText'")
    expect(notebookAppSource).toContain('notebook-tree-children')
    expect(notebookAppSource).toContain("onSelectFolder={setSelectedFolderId}")
    expect(notebookAppSource).not.toContain('<button type="button" onClick={importNotebook}>Import</button>')
    expect(notebookAppSource).not.toContain('<button type="button" onClick={exportNotebook}>Export</button>')
  })

  it('uses soft note-only tree selection instead of persistent folder highlighting', () => {
    expect(appCssSource).toContain('.notebook-tree-row.is-note.is-active .notebook-tree-main')
    expect(appCssSource).not.toContain('.notebook-tree-row.is-active .notebook-tree-main')
    expect(notebookAppSource).toContain("const selected = item.type === 'note' && item.id === activeNoteId")
    expect(appCssSource).toContain('--notebook-tree-row-bg: color-mix(in srgb, var(--app-text) 10%, transparent);')
    expect(appCssSource).toContain('.notebook-tree-children::before')
    expect(appCssSource).toContain('padding: 4px 8px 4px calc(var(--tree-depth, 0) * 12px + 5px);')
    expect(appCssSource).toContain('padding-left: calc(var(--tree-depth, 0) * 12px + 5px);')
    expect(appCssSource).toContain('.notebook-tree-children .notebook-tree-row.is-note .notebook-tree-main')
    expect(appCssSource).toContain('padding-left: calc(var(--tree-depth, 0) * 12px + 11px);')
    expect(appCssSource).toContain('left: calc(var(--tree-depth, 0) * 12px + 13px);')
    expect(appCssSource).toContain('--notebook-tree-row-bg: transparent;')
    expect(appCssSource).toContain('background: var(--notebook-tree-row-bg);')
    expect(appCssSource).toContain('.notebook-tree-folder-icon')
    expect(appCssSource).toContain('height: 22px;')
    expect(appCssSource).toContain('linear-gradient(var(--notebook-tree-row-bg), var(--notebook-tree-row-bg))')
    expect(appCssSource).not.toContain('.notebook-tree-row.is-active .notebook-tree-main,\n.notebook-search-result.is-active')
  })

  it('supports intentional long-press rename and sidebar drag/drop reordering', () => {
    expect(notebookAppSource).toContain('NOTEBOOK_TREE_RENAME_LONG_PRESS_MS = 500')
    expect(notebookAppSource).toContain('onPointerDown={beginLongPressRename}')
    expect(notebookAppSource).toContain('className="notebook-tree-rename-input"')
    expect(notebookAppSource).toContain('draggable={!renaming}')
    expect(notebookAppSource).toContain('moveNotebookItem(previous.notebook, draggedItemId, target.parentFolderId, target.index)')
    expect(notebookAppSource).toContain('notebook-tree-root-drop-zone')
    expect(appCssSource).toContain('.notebook-tree-row.is-drop-before::before')
    expect(appCssSource).toContain('.notebook-tree-row.is-drop-inside .notebook-tree-main')
    expect(appCssSource).toContain('.notebook-tree-root-drop-zone.is-drop-root')
  })

  it('does not keep hidden inline rename or delete controls in note rows', () => {
    expect(notebookAppSource).not.toContain('notebook-tree-actions')
    expect(notebookAppSource).not.toContain('notebook-tree-action')
    expect(appCssSource).not.toContain('notebook-tree-actions')
    expect(appCssSource).not.toContain('notebook-tree-action')
    expect(notebookAppSource).not.toContain('onDoubleClick={() => onStartRename(item.id, item.title)}')
    expect(appCssSource).toContain('max-width: 100%;')
    expect(appCssSource).toContain('box-sizing: border-box;')
  })

  it('wires sidebar note activation to notebook cursor restore', () => {
    expect(notebookAppSource).toContain('useNoteCursorPersistence')
    expect(notebookAppSource).toContain('usePendingNoteCursorRestore')
    expect(notebookAppSource).toContain('applyActiveCursorToState(previous)')
    expect(notebookAppSource).toContain('pendingFocusToAisleIdRef.current = preferredAisleId || null')
    expect(notebookAppSource).toContain('activateAisleEditor(buildAisleEditorKey(active.noteBody.id, aisleId), { focus: true })')
  })

  it('wires note and folder sidebar context menus with reveal, rename, and delete actions', () => {
    expect(notebookAppSource).toContain('function NotebookTreeContextMenu')
    expect(notebookAppSource).toContain('getNotebookSidebarRevealLabel')
    expect(notebookAppSource).toContain('Reveal in Finder')
    expect(notebookAppSource).toContain('Show in File Explorer')
    expect(notebookAppSource).toContain("const deleteLabel = menu.itemType === 'folder' ? 'Delete folder' : 'Delete note'")
    expect(notebookAppSource).toContain('onContextMenu={(event) => {')
    expect(notebookAppSource).toContain('revealNotebookItemLocation(payload)')
    expect(notebookAppSource).toContain("trigger: 'notebook-sidebar-reveal-item'")
  })

  it('exposes native notebook item reveal for sidebar file locations', () => {
    expect(electronApiSource).toContain('revealNotebookItemLocation?:')
    expect(preloadSource).toContain("revealNotebookItemLocation: (payload) => ipcRenderer.invoke('reveal-notebook-item-location', payload)")
    expect(ipcStorageSource).toContain("ipcMain.handle?.('reveal-notebook-item-location'")
  })

  it('registers sidebar file tree icons in the shared app icon set', () => {
    expect(iconSource).toContain("'folder'")
    expect(iconSource).toContain("'folderOpen'")
    expect(iconSource).not.toContain("'chevronRight'")
    expect(iconSource).not.toContain("'chevronDown'")
    expect(iconSource).not.toContain("'fileText'")
    expect(iconSource).toContain('M20 20a2 2 0 0 0 2-2V8')
    expect(iconSource).toContain('m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20')
  })
})
