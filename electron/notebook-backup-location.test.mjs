import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  NOTEBOOK_BACKUP_MANAGED_DIR,
  configureNotebookBackupDestination,
  getNotebookBackupManagedFolderPath,
  readNotebookBackupConfig,
  resetNotebookBackupDestination,
  validateNotebookBackupDestination,
  writeNotebookBackupArchive,
} from './notebook-backup-location.mjs'

function withTempDirs(run) {
  const userDataPath = mkdtempSync(path.join(os.tmpdir(), 'tabs-backup-user-data-'))
  const notebookRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-backup-notebook-'))
  const destinationRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-backup-destination-'))
  try {
    return run({ userDataPath, notebookRoot, destinationRoot })
  } finally {
    rmSync(userDataPath, { recursive: true, force: true })
    rmSync(notebookRoot, { recursive: true, force: true })
    rmSync(destinationRoot, { recursive: true, force: true })
  }
}

function listBackupNames(destinationRoot, notebookRoot) {
  const managedPath = getNotebookBackupManagedFolderPath(destinationRoot, notebookRoot)
  return readdirSync(managedPath).filter((entry) => entry.endsWith('.zip')).sort()
}

describe('notebook backup location service', () => {
  it('creates timestamped notebook archive zips in the managed destination folder', () =>
    withTempDirs(({ userDataPath, notebookRoot, destinationRoot }) => {
      configureNotebookBackupDestination(userDataPath, destinationRoot)

      const result = writeNotebookBackupArchive(userDataPath, notebookRoot, Buffer.from('zip'), {
        trigger: 'manual',
        now: new Date(2026, 0, 2, 3, 4, 5).getTime(),
      })

      expect(result.ok).toBe(true)
      expect(result.backupPath).toContain(`${NOTEBOOK_BACKUP_MANAGED_DIR}${path.sep}`)
      expect(path.basename(result.backupPath)).toBe('tabs-notebook-2026-01-02-030405.zip')
      expect(readFileSync(result.backupPath, 'utf8')).toBe('zip')
      expect(result.status).toMatchObject({
        enabled: true,
        status: 'ready',
        lastSuccessfulAt: new Date(2026, 0, 2, 3, 4, 5).getTime(),
        lastBackupPath: result.backupPath,
      })
    }))

  it('skips automatic backups until the fixed interval elapses but lets manual backups bypass it', () =>
    withTempDirs(({ userDataPath, notebookRoot, destinationRoot }) => {
      configureNotebookBackupDestination(userDataPath, destinationRoot)
      const first = writeNotebookBackupArchive(userDataPath, notebookRoot, Buffer.from('first'), {
        trigger: 'automatic',
        now: 1000,
      })
      const skipped = writeNotebookBackupArchive(userDataPath, notebookRoot, Buffer.from('skip'), {
        trigger: 'automatic',
        now: 2000,
      })
      const manual = writeNotebookBackupArchive(userDataPath, notebookRoot, Buffer.from('manual'), {
        trigger: 'manual',
        now: 3000,
      })

      expect(first.ok).toBe(true)
      expect(skipped).toMatchObject({
        ok: true,
        skipped: true,
        status: { lastSkippedReason: 'interval' },
      })
      expect(manual.ok).toBe(true)
      expect(listBackupNames(destinationRoot, notebookRoot)).toHaveLength(2)
    }))

  it('keeps only the latest 30 managed archives after a successful new backup', () =>
    withTempDirs(({ userDataPath, notebookRoot, destinationRoot }) => {
      configureNotebookBackupDestination(userDataPath, destinationRoot)

      for (let index = 0; index < 31; index += 1) {
        writeNotebookBackupArchive(userDataPath, notebookRoot, Buffer.from(`zip-${index}`), {
          trigger: 'manual',
          now: new Date(2026, 0, 1, 0, index, 0).getTime(),
        })
      }

      const names = listBackupNames(destinationRoot, notebookRoot)
      expect(names).toHaveLength(30)
      expect(names[0]).toBe('tabs-notebook-2026-01-01-000100.zip')
      expect(names.at(-1)).toBe('tabs-notebook-2026-01-01-003000.zip')
      expect(names).not.toContain('tabs-notebook-2026-01-01-000000.zip')
    }))

  it('does not prune existing managed archives when a new backup write fails', () =>
    withTempDirs(({ userDataPath, notebookRoot, destinationRoot }) => {
      configureNotebookBackupDestination(userDataPath, destinationRoot)
      const managedPath = getNotebookBackupManagedFolderPath(destinationRoot, notebookRoot)
      mkdirSync(managedPath, { recursive: true })
      for (let index = 0; index < 31; index += 1) {
        writeFileSync(
          path.join(managedPath, `tabs-notebook-2026-01-01-00${String(index).padStart(2, '0')}00.zip`),
          'existing',
        )
      }
      const failed = writeNotebookBackupArchive(userDataPath, notebookRoot, Buffer.alloc(0), {
        trigger: 'manual',
        now: new Date(2026, 0, 2).getTime(),
      })

      expect(failed).toMatchObject({
        ok: false,
        error: 'Notebook archive payload is empty.',
      })
      expect(readNotebookBackupConfig(userDataPath).lastBackupPath).toBeNull()
      expect(readdirSync(managedPath).filter((entry) => entry.endsWith('.zip'))).toHaveLength(31)
    }))

  it('rejects active notebook folders and folders inside the active notes folder', () =>
    withTempDirs(({ notebookRoot }) => {
      expect(validateNotebookBackupDestination(notebookRoot, notebookRoot)).toMatchObject({
        ok: false,
        error: 'The active notebook folder cannot be used as its backup folder. Choose a different folder.',
      })
      expect(validateNotebookBackupDestination(path.join(notebookRoot, 'notes'), notebookRoot)).toMatchObject({
        ok: false,
        error: 'Backup folders cannot be inside the active notes folder. Choose a different folder.',
      })
      expect(validateNotebookBackupDestination(path.join(notebookRoot, 'notes', 'backups'), notebookRoot)).toMatchObject({
        ok: false,
      })
    }))

  it('resets backup configuration without deleting existing backup archives', () =>
    withTempDirs(({ userDataPath, notebookRoot, destinationRoot }) => {
      configureNotebookBackupDestination(userDataPath, destinationRoot)
      const result = writeNotebookBackupArchive(userDataPath, notebookRoot, Buffer.from('zip'), {
        trigger: 'manual',
        now: new Date(2026, 0, 2).getTime(),
      })

      resetNotebookBackupDestination(userDataPath)

      expect(readNotebookBackupConfig(userDataPath).enabled).toBe(false)
      expect(existsSync(result.backupPath)).toBe(true)
    }))
})
