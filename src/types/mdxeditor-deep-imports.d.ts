declare module '@mdxeditor-internal/MDXEditor.js' {
  import type { ForwardRefExoticComponent, RefAttributes } from 'react'
  import type { MDXEditorMethods, MDXEditorProps } from '@mdxeditor/editor'

  export const MDXEditor: ForwardRefExoticComponent<MDXEditorProps & RefAttributes<MDXEditorMethods>>
}

declare module '@mdxeditor-internal/plugins/frontmatter/index.js' {
  import type { RealmPlugin } from '@mdxeditor/editor'

  export const frontmatterPlugin: (params?: unknown) => RealmPlugin
}

declare module '@mdxeditor-internal/plugins/headings/index.js' {
  import type { RealmPlugin } from '@mdxeditor/editor'

  export const headingsPlugin: (params?: unknown) => RealmPlugin
}

declare module '@mdxeditor-internal/plugins/image/index.js' {
  import type { RealmPlugin } from '@mdxeditor/editor'

  export const imagePlugin: (params?: unknown) => RealmPlugin
}

declare module '@mdxeditor-internal/plugins/link/index.js' {
  import type { RealmPlugin } from '@mdxeditor/editor'

  export const linkPlugin: (params?: unknown) => RealmPlugin
}

declare module '@mdxeditor-internal/plugins/lists/index.js' {
  import type { RealmPlugin } from '@mdxeditor/editor'

  export const listsPlugin: (params?: unknown) => RealmPlugin
}

declare module '@mdxeditor-internal/plugins/markdown-shortcut/index.js' {
  import type { RealmPlugin } from '@mdxeditor/editor'

  export const markdownShortcutPlugin: (params?: unknown) => RealmPlugin
}

declare module '@mdxeditor-internal/plugins/quote/index.js' {
  import type { RealmPlugin } from '@mdxeditor/editor'

  export const quotePlugin: (params?: unknown) => RealmPlugin
}

declare module '@mdxeditor-internal/plugins/table/index.js' {
  import type { RealmPlugin } from '@mdxeditor/editor'

  export const tablePlugin: (params?: unknown) => RealmPlugin
}

declare module '@mdxeditor-internal/plugins/thematic-break/index.js' {
  import type { RealmPlugin } from '@mdxeditor/editor'

  export const thematicBreakPlugin: (params?: unknown) => RealmPlugin
}
