import type { ReactNode } from 'react'

export type AppController = {
  shell: ReactNode
}

export function AppShell({ controller }: { controller: AppController }) {
  return <>{controller.shell}</>
}
