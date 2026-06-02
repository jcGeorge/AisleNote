import { describe, expect, it, vi } from 'vitest'
import { closeEditorEphemera } from './editor-ephemera'

describe('editor ephemera dismissal', () => {
  it('closes all registered transient editor surfaces', () => {
    const dismissMentionMenu = vi.fn()
    const dismissTagAutocomplete = vi.fn()
    const closeToolbarPopovers = vi.fn()
    const closeContextMenu = vi.fn()
    const closeImageTools = vi.fn()
    const closeTableTools = vi.fn()
    const closeTableOfContents = vi.fn()
    const closeShortcutMenu = vi.fn()

    closeEditorEphemera({
      dismissMentionMenu,
      dismissTagAutocomplete,
      closeToolbarPopovers,
      closeContextMenu,
      closeImageTools,
      closeTableTools,
      closeTableOfContents,
      closeShortcutMenu,
    })

    expect(dismissMentionMenu).toHaveBeenCalledTimes(1)
    expect(dismissTagAutocomplete).toHaveBeenCalledTimes(1)
    expect(closeToolbarPopovers).toHaveBeenCalledTimes(1)
    expect(closeContextMenu).toHaveBeenCalledTimes(1)
    expect(closeImageTools).toHaveBeenCalledTimes(1)
    expect(closeTableTools).toHaveBeenCalledTimes(1)
    expect(closeTableOfContents).toHaveBeenCalledTimes(1)
    expect(closeShortcutMenu).toHaveBeenCalledWith({ restoreEditorFocus: undefined })
  })

  it('passes restore focus only to shortcut menu dismissal', () => {
    const closeToolbarPopovers = vi.fn()
    const closeShortcutMenu = vi.fn()

    closeEditorEphemera(
      {
        closeToolbarPopovers,
        closeShortcutMenu,
      },
      { restoreEditorFocus: true },
    )

    expect(closeToolbarPopovers).toHaveBeenCalledWith()
    expect(closeShortcutMenu).toHaveBeenCalledWith({ restoreEditorFocus: true })
  })
})
