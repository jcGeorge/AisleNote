const OUTSIDE_TABLE_TEXT = 'Fall in line here.'
const INSIDE_TABLE_TEXT = 'copy'

export async function waitForEditable(container: HTMLElement): Promise<HTMLElement> {
  const startedAt = performance.now()

  return new Promise((resolve, reject) => {
    const tick = () => {
      const editable = getEditableElement(container)
      if (editable) {
        resolve(editable)
        return
      }

      if (performance.now() - startedAt > 5000) {
        reject(new Error('Timed out waiting for editable element.'))
        return
      }

      window.setTimeout(tick, 16)
    }

    tick()
  })
}

export async function waitForAnimationFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

export function focusOutsideTableText(container: HTMLElement): void {
  focusText(container, OUTSIDE_TABLE_TEXT)
}

export function focusInsideTableText(container: HTMLElement): void {
  focusText(container, INSIDE_TABLE_TEXT)
}

export function getEditableElement(container: HTMLElement): HTMLElement | null {
  return (
    container.querySelector<HTMLElement>('.cm-content') ??
    container.querySelector<HTMLElement>('.ProseMirror') ??
    container.querySelector<HTMLElement>('[contenteditable="true"]') ??
    container.querySelector<HTMLElement>('textarea')
  )
}

function focusText(container: HTMLElement, text: string): void {
  const editable = getEditableElement(container)
  if (!editable) {
    container.focus()
    return
  }

  editable.focus()
  const target = findTextNode(editable, text)
  if (!target) {
    focusEnd(editable)
    return
  }

  const index = Math.max(0, target.node.data.indexOf(text))
  const range = document.createRange()
  range.setStart(target.node, index + target.offset)
  range.collapse(true)

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function focusEnd(editable: HTMLElement): void {
  const range = document.createRange()
  range.selectNodeContents(editable)
  range.collapse(false)

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function findTextNode(root: HTMLElement, text: string): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  while (current) {
    if (current instanceof Text && current.data.includes(text)) {
      return { node: current, offset: current.data.indexOf(text) + text.length }
    }
    current = walker.nextNode()
  }
  return null
}
