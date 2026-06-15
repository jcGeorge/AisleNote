declare module '@toast-ui/editor' {
  export class Editor {
    constructor(options: Record<string, unknown>)
    getMarkdown(): string
    setMarkdown(markdown: string, cursorToEnd?: boolean): void
    exec(command: string, payload?: Record<string, unknown>): void
    insertText(text: string): void
    focus(): void
    destroy(): void
  }
}
