type ToastHtmlInlineNode = {
  attrs?: Record<string, unknown>
}

type ToastHtmlRendererContext = {
  entering: boolean
}

const SAFE_SPAN_ATTRIBUTE_RE = /^(class|style|title|lang|dir|data-[\w:-]+|aria-[\w:-]+)$/i

function getSafeSpanAttributes(attrs: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!attrs) return undefined
  const safeAttrs = Object.fromEntries(
    Object.entries(attrs).flatMap(([name, value]) => {
      const normalizedName = name.trim()
      if (!normalizedName || !SAFE_SPAN_ATTRIBUTE_RE.test(normalizedName)) return []
      if (value === null || value === undefined) return []
      return [[normalizedName, String(value)]]
    }),
  )
  return Object.keys(safeAttrs).length > 0 ? safeAttrs : undefined
}

export const AISLENOTE_TOAST_HTML_RENDERER = {
  htmlInline: {
    span: (node: ToastHtmlInlineNode, context: ToastHtmlRendererContext) => ({
      type: context.entering ? 'openTag' : 'closeTag',
      tagName: 'span',
      ...(context.entering ? { attributes: getSafeSpanAttributes(node.attrs) } : {}),
    }),
  },
}
