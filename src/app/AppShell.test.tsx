import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppShell, type AppController } from './AppShell'

describe('AppShell', () => {
  it('renders the shell node supplied by the app controller', () => {
    const controller: AppController = {
      shell: <main className="app-shell view-main">main view</main>,
    }

    const html = renderToStaticMarkup(<AppShell controller={controller} />)

    expect(html).toContain('class="app-shell view-main"')
    expect(html).toContain('main view')
  })
})
