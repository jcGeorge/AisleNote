declare module '@toast-ui/editor' {
  export class Editor {
    static factory(options: Record<string, unknown>): Editor
    constructor(options: Record<string, unknown>)
    getMarkdown(): string
    setMarkdown(markdown: string, cursorToEnd?: boolean): void
    on?(type: string, handler: (...args: unknown[]) => void): void
    off?(type: string): void
    exec(command: string, payload?: Record<string, unknown>): void
    insertText(text: string): void
    focus(): void
    destroy(): void
  }
}
