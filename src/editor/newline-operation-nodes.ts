import type { Node as ProseMirrorNode } from 'prosemirror-model'
import type { NewlineOperationId } from '../types/app'
import { createBulletListAttrs } from './list-markers'

export function getOperationTextLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function getInlineText(text: string): string {
  return getOperationTextLines(text).join(' ')
}

function createParagraph(schema: any, text = ''): ProseMirrorNode {
  const inlineText = getInlineText(text)
  return schema.nodes.paragraph.create(null, inlineText ? schema.text(inlineText) : undefined)
}

export function createListItemNode(schema: any, text: string, task: boolean): ProseMirrorNode {
  return schema.nodes.listItem.create(
    task ? { task: true, checked: false } : null,
    createParagraph(schema, text),
  )
}

export function createOperationListItems(
  schema: any,
  operation: NewlineOperationId,
  text = '',
): ProseMirrorNode[] {
  const lines = getOperationTextLines(text)
  const itemTexts = lines.length > 0 ? lines : ['']
  return itemTexts.map((line) => createListItemNode(schema, line, operation === 'task'))
}

export function createOperationListNode(
  schema: any,
  operation: NewlineOperationId,
  text = '',
): ProseMirrorNode | null {
  if (operation !== 'task' && operation !== 'dashList' && operation !== 'bulletList' && operation !== 'numberedList') {
    return null
  }
  const listType = operation === 'numberedList' ? schema.nodes.orderedList : schema.nodes.bulletList
  const listAttrs =
    operation === 'numberedList' ? { order: 1 } : createBulletListAttrs(operation === 'dashList' ? 'dash' : 'bullet')
  return listType.create(listAttrs, createOperationListItems(schema, operation, text))
}

export function createOperationNodes(schema: any, operation: NewlineOperationId, text = ''): ProseMirrorNode[] {
  if (operation === 'horizontalLine') {
    return [schema.nodes.thematicBreak.create(), schema.nodes.paragraph.create()]
  }

  if (operation === 'codeBlock') {
    return [schema.nodes.codeBlock.create(null, text ? schema.text(text) : undefined)]
  }

  if (operation === 'blockQuote') {
    const lines = getOperationTextLines(text)
    const paragraphs = lines.length > 0 ? lines.map((line) => createParagraph(schema, line)) : [createParagraph(schema)]
    return [schema.nodes.blockQuote.create(null, paragraphs)]
  }

  if (operation === 'task' || operation === 'dashList' || operation === 'bulletList' || operation === 'numberedList') {
    const listNode = createOperationListNode(schema, operation, text)
    return listNode ? [listNode] : []
  }

  return [createParagraph(schema, text)]
}
