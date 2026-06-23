import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'
import { registerFileIpc } from './ipc-files.mjs'

const tempRoots = []

function tempRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aislenote-ipc-files-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop(), { recursive: true, force: true })
  }
})

function createHandlers(selectedPath) {
  const handlers = new Map()
  registerFileIpc({
    ipcMain: {
      handle: (name, handler) => {
        handlers.set(name, handler)
      },
    },
    dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: [selectedPath] }),
    },
  })
  return handlers
}

describe('notebook import file IPC', () => {
  it('opens Markdown folders with selected-folder and Obsidian-vault asset roots', async () => {
    const root = tempRoot()
    const vaultRoot = path.join(root, 'Vault')
    const sourceRoot = path.join(vaultRoot, 'Christianity')
    mkdirSync(path.join(vaultRoot, '.obsidian'), { recursive: true })
    mkdirSync(path.join(sourceRoot, 'Ministry'), { recursive: true })
    mkdirSync(path.join(vaultRoot, 'Z-Assets'), { recursive: true })
    writeFileSync(path.join(sourceRoot, 'Ministry', 'Note.md'), '![[Pasted Graphic.png]]', 'utf8')
    writeFileSync(path.join(vaultRoot, 'Z-Assets', 'Pasted Graphic.png'), 'image-bytes')

    const handlers = createHandlers(sourceRoot)
    const openResult = await handlers.get('open-notebook-import-source')()

    expect(openResult).toMatchObject({
      canceled: false,
      ok: true,
      kind: 'markdown-folder',
      rootName: 'Christianity',
    })
    expect(openResult.files.map((file) => file.relativePath)).toEqual(['Ministry/Note.md'])
    expect(openResult.assetRoots).toEqual([
      { id: 'source', name: 'Christianity', sourceBasePath: '' },
      { id: 'vault', name: 'Vault', sourceBasePath: 'Christianity' },
    ])

    const readResult = await handlers.get('read-folder-import-asset')(null, {
      sourceId: openResult.sourceId,
      assetRootId: 'vault',
      relativePath: 'Z-Assets/Pasted Graphic.png',
    })

    expect(readResult.ok).toBe(true)
    expect(Buffer.from(new Uint8Array(readResult.bytes)).toString('utf8')).toBe('image-bytes')
    expect(readResult.mimeType).toBe('image/png')
  })

  it('falls back from non-notebook ZIPs to Markdown ZIP import results', async () => {
    const root = tempRoot()
    const zipPath = path.join(root, 'obsidian-export.zip')
    const zip = new JSZip()
    zip.file('Notes/Source.md', 'See [[Target]]')
    zip.file('Notes/Target.md', 'Target')
    zip.file('Z-Assets/pixel.png', 'png-bytes')
    writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }))

    const handlers = createHandlers(zipPath)
    const openResult = await handlers.get('open-notebook-import-source')()

    expect(openResult).toMatchObject({
      canceled: false,
      ok: true,
      kind: 'markdown-zip',
      rootName: 'obsidian-export',
    })
    expect(openResult.files.map((file) => file.relativePath)).toEqual(['Notes/Source.md', 'Notes/Target.md'])
    expect(openResult.assets.map((asset) => asset.relativePath)).toEqual(['Z-Assets/pixel.png'])
    expect(openResult.assetRoots).toEqual([{ id: 'source', name: 'obsidian-export', sourceBasePath: '' }])
  })

  it('rejects symlinks inside Markdown folders', async () => {
    const root = tempRoot()
    const sourceRoot = path.join(root, 'Source')
    mkdirSync(sourceRoot, { recursive: true })
    writeFileSync(path.join(sourceRoot, 'Note.md'), 'note', 'utf8')
    symlinkSync(path.join(sourceRoot, 'Note.md'), path.join(sourceRoot, 'Linked.md'))

    const handlers = createHandlers(sourceRoot)
    const openResult = await handlers.get('open-notebook-import-source')()

    expect(openResult).toMatchObject({
      canceled: false,
      ok: false,
    })
    expect(openResult.error).toContain('does not allow symlinks')
  })
})
