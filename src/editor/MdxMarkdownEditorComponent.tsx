import { useEffect, useRef, useState, type RefObject } from 'react'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { preloadMdxEditorModule, type MdxEditorModule } from './mdx-editor-loader'
import { resolveAssetDisplayUrl } from '../markdown/image-asset-registry'

type MdxMarkdownEditorComponentProps = {
  editorRef: RefObject<MDXEditorMethods | null>
  markdown: string
  onChange: (markdown: string) => void
  onInitialNormalize: (markdown: string) => void
  onReady?: (durationMs: number) => void
}

export function MdxMarkdownEditorComponent({
  editorRef,
  markdown,
  onChange,
  onInitialNormalize,
  onReady,
}: MdxMarkdownEditorComponentProps) {
  const [editorModule, setEditorModule] = useState<MdxEditorModule | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const onReadyRef = useRef(onReady)

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    let cancelled = false
    const startedAt = getMdxEditorNow()
    preloadMdxEditorModule()
      .then((loadedModule) => {
        if (cancelled) return
        setEditorModule(loadedModule)
        requestMdxEditorFrame(() => {
          if (!cancelled) onReadyRef.current?.(getMdxEditorNow() - startedAt)
        })
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!editorModule) {
    return (
      <div className="tabs-mdxeditor-loading" data-load-failed={loadError ? 'true' : undefined}>
        {loadError ? `MDXEditor failed to load: ${loadError}` : 'Loading MDXEditor...'}
      </div>
    )
  }

  const {
    MDXEditor,
    frontmatterPlugin,
    headingsPlugin,
    imagePlugin,
    linkPlugin,
    listsPlugin,
    markdownShortcutPlugin,
    quotePlugin,
    tablePlugin,
    thematicBreakPlugin,
  } = editorModule

  return (
    <MDXEditor
      ref={editorRef}
      markdown={markdown}
      className="tabs-mdxeditor"
      contentEditableClassName="tabs-mdxeditor-content"
      spellCheck
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        linkPlugin(),
        tablePlugin(),
        imagePlugin({
          disableImageResize: true,
          disableImageSettingsButton: true,
          imagePreviewHandler: async (source: string) => resolveAssetDisplayUrl(source),
        }),
        frontmatterPlugin(),
        markdownShortcutPlugin(),
      ]}
      onChange={(nextMarkdown: string, initialMarkdownNormalize: boolean) => {
        if (initialMarkdownNormalize) {
          onInitialNormalize(nextMarkdown)
          return
        }
        onChange(nextMarkdown)
      }}
    />
  )
}

function getMdxEditorNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function requestMdxEditorFrame(callback: () => void) {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    callback()
    return
  }
  window.requestAnimationFrame(callback)
}
