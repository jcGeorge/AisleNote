import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  DIAGNOSTIC_LOG_RETENTION_DAYS,
  registerDiagnosticIpc,
} from './ipc-diagnostics.mjs'

function createIpcMain() {
  const handlers = new Map()
  return {
    handle: vi.fn((name, handler) => {
      handlers.set(name, handler)
    }),
    handlers,
  }
}

async function withTempUserDataPath(run) {
  const userDataPath = mkdtempSync(path.join(os.tmpdir(), 'aislenote-diagnostics-user-data-'))
  try {
    return await run(userDataPath)
  } finally {
    rmSync(userDataPath, { recursive: true, force: true })
  }
}

function appWithUserDataPath(userDataPath) {
  return {
    getPath: vi.fn((name) => {
      if (name !== 'userData') throw new Error(`unexpected path ${name}`)
      return userDataPath
    }),
  }
}

function diagnosticEntry(dayKey, index = 1) {
  return {
    id: `${dayKey}-${index}`,
    createdAt: `${dayKey}T00:00:00.000Z`,
    dayKey,
    sessionId: 'session-1',
    level: 'warning',
    area: 'performance',
    event: 'slow-operation',
    durationMs: 51.25,
    message: 'slow task',
    details: {
      markdown: 'secret',
      noteBodyId: 'body-1',
    },
  }
}

describe('diagnostic ipc', () => {
  it('appends, lists, reads, and sanitizes diagnostic day files', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const ipcMain = createIpcMain()
      registerDiagnosticIpc({ ipcMain, app: appWithUserDataPath(userDataPath) })

      await expect(
        ipcMain.handlers.get('append-diagnostic-log-entry')(null, diagnosticEntry('2026-06-06')),
      ).resolves.toEqual({ ok: true })
      await expect(ipcMain.handlers.get('list-diagnostic-log-days')()).resolves.toEqual({
        ok: true,
        days: ['2026-06-06'],
      })
      await expect(
        ipcMain.handlers.get('read-diagnostic-log-entries')(null, { dayKey: '2026-06-06' }),
      ).resolves.toMatchObject({
        ok: true,
        entries: [
          {
            id: '2026-06-06-1',
            details: {
              markdown: '[redacted]',
              noteBodyId: 'body-1',
            },
          },
        ],
      })

      const stored = readFileSync(path.join(userDataPath, 'diagnostics', '2026-06-06.ndjson'), 'utf8')
      expect(stored).toContain('"markdown":"[redacted]"')
      expect(stored).not.toContain('secret')
    }))

  it('rejects invalid payloads and invalid day reads', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const ipcMain = createIpcMain()
      registerDiagnosticIpc({ ipcMain, app: appWithUserDataPath(userDataPath) })

      await expect(ipcMain.handlers.get('append-diagnostic-log-entry')(null, { bad: true })).resolves.toEqual({
        ok: false,
        error: 'invalid-payload',
      })
      await expect(ipcMain.handlers.get('read-diagnostic-log-entries')(null, { dayKey: '../bad' })).resolves.toEqual({
        ok: false,
        error: 'invalid-day',
        entries: [],
      })
    }))

  it('retains only the newest diagnostic day files', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const ipcMain = createIpcMain()
      registerDiagnosticIpc({ ipcMain, app: appWithUserDataPath(userDataPath) })

      for (let index = 1; index <= DIAGNOSTIC_LOG_RETENTION_DAYS + 2; index += 1) {
        const dayKey = `2026-06-${String(index).padStart(2, '0')}`
        await ipcMain.handlers.get('append-diagnostic-log-entry')(null, diagnosticEntry(dayKey, index))
      }

      const result = await ipcMain.handlers.get('list-diagnostic-log-days')()
      expect(result.days).toHaveLength(DIAGNOSTIC_LOG_RETENTION_DAYS)
      expect(result.days[0]).toBe('2026-06-16')
      expect(result.days).not.toContain('2026-06-01')
    }))

  it('creates and opens the diagnostics folder', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const ipcMain = createIpcMain()
      const shell = { openPath: vi.fn(() => Promise.resolve('')) }
      registerDiagnosticIpc({ ipcMain, app: appWithUserDataPath(userDataPath), shell })

      await expect(ipcMain.handlers.get('open-diagnostics-folder')()).resolves.toEqual({ ok: true })

      const diagnosticsPath = path.join(userDataPath, 'diagnostics')
      expect(existsSync(diagnosticsPath)).toBe(true)
      expect(shell.openPath).toHaveBeenCalledWith(diagnosticsPath)
    }))

  it('reports diagnostics folder open failures', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const ipcMain = createIpcMain()
      const shell = { openPath: vi.fn(() => Promise.resolve('permission denied')) }
      registerDiagnosticIpc({ ipcMain, app: appWithUserDataPath(userDataPath), shell })

      await expect(ipcMain.handlers.get('open-diagnostics-folder')()).resolves.toEqual({
        ok: false,
        error: 'permission denied',
      })
    }))
})
