const FORBIDDEN_TAGS = new Set([
  'base',
  'button',
  'form',
  'input',
  'link',
  'meta',
  'object',
  'script',
  'select',
  'style',
  'textarea',
  'title',
])

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) return true
  if (/^https?:/i.test(trimmed)) return true
  if (/^(mailto|tel|callto|cid|xmpp):/i.test(trimmed)) return true
  if (/^data:image\//i.test(trimmed)) return true
  if (/^blob:/i.test(trimmed)) return true
  if (/^aislenote-asset:/i.test(trimmed)) return true
  return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
}

export function sanitizeEditorHtml(html: string): string {
  if (typeof document === 'undefined') return html
  const template = document.createElement('template')
  template.innerHTML = html

  template.content.querySelectorAll('*').forEach((element) => {
    if (FORBIDDEN_TAGS.has(element.tagName.toLowerCase())) {
      element.remove()
      return
    }

    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name)
        return
      }
      if (name === 'style') {
        element.removeAttribute(attribute.name)
        return
      }
      if ((name === 'src' || name === 'href' || name === 'xlink:href') && !isSafeUrl(attribute.value)) {
        element.removeAttribute(attribute.name)
      }
    })
  })

  return template.innerHTML
}
