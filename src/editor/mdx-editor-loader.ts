export type MdxEditorModule = typeof import('./mdx-editor-module')

let mdxEditorModulePromise: Promise<MdxEditorModule> | null = null

export function preloadMdxEditorModule(): Promise<MdxEditorModule> {
  if (!mdxEditorModulePromise) {
    mdxEditorModulePromise = import('./mdx-editor-module')
  }
  return mdxEditorModulePromise
}
