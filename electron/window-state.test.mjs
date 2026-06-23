import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getWindowStatePath,
  loadWindowState,
  saveWindowState,
  watchWindowState,
} from './window-state.mjs'

const tempRoots = []
const defaults = {
  width: 1200,
  height: 800,
  minWidth: 900,
  minHeight: 640,
}

function tempRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tabs-window-state-'))
  tempRoots.push(root)
  return root
}

function createScreen(workAreas, primaryIndex = 0) {
  const displays = workAreas.map((workArea) => ({ workArea }))
  return {
    getAllDisplays: () => displays,
    getPrimaryDisplay: () => displays[primaryIndex],
  }
}

function writeState(userDataPath, state) {
  writeFileSync(getWindowStatePath(userDataPath), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

function readState(userDataPath) {
  return JSON.parse(readFileSync(getWindowStatePath(userDataPath), 'utf8'))
}

function createWindow(bounds, options = {}) {
  const window = new EventEmitter()
  window.getNormalBounds = () => bounds
  window.getBounds = () => bounds
  window.isDestroyed = () => options.destroyed === true
  window.isMinimized = () => options.minimized === true
  window.isFullScreen = () => options.fullScreen === true
  window.isMaximized = () => options.maximized === true
  return window
}

afterEach(() => {
  vi.useRealTimers()
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop(), { recursive: true, force: true })
  }
})

describe('Electron window state', () => {
  it('restores saved normal bounds and maximized state when visible', () => {
    const userDataPath = tempRoot()
    writeState(userDataPath, {
      version: 1,
      bounds: { x: 80, y: 90, width: 1280, height: 900 },
      isMaximized: true,
    })

    const restored = loadWindowState(
      userDataPath,
      createScreen([{ x: 0, y: 0, width: 1920, height: 1080 }]),
      defaults,
    )

    expect(restored).toEqual({
      bounds: { x: 80, y: 90, width: 1280, height: 900 },
      isMaximized: true,
    })
  })

  it('falls back to centered defaults for missing or corrupt state files', () => {
    const missingUserDataPath = tempRoot()
    const corruptUserDataPath = tempRoot()
    writeFileSync(getWindowStatePath(corruptUserDataPath), '{not-json', 'utf8')
    const screen = createScreen([{ x: 0, y: 0, width: 1920, height: 1080 }])

    expect(loadWindowState(missingUserDataPath, screen, defaults)).toEqual({
      bounds: { x: 360, y: 140, width: 1200, height: 800 },
      isMaximized: false,
    })
    expect(loadWindowState(corruptUserDataPath, screen, defaults)).toEqual({
      bounds: { x: 360, y: 140, width: 1200, height: 800 },
      isMaximized: false,
    })
  })

  it('enforces minimum restore size', () => {
    const userDataPath = tempRoot()
    writeState(userDataPath, {
      version: 1,
      bounds: { x: 20, y: 30, width: 400, height: 300 },
      isMaximized: false,
    })

    const restored = loadWindowState(
      userDataPath,
      createScreen([{ x: 0, y: 0, width: 1920, height: 1080 }]),
      defaults,
    )

    expect(restored.bounds).toEqual({ x: 20, y: 30, width: 900, height: 640 })
  })

  it('falls back to centered defaults when saved bounds are off-screen', () => {
    const userDataPath = tempRoot()
    writeState(userDataPath, {
      version: 1,
      bounds: { x: 5000, y: 5000, width: 1200, height: 800 },
      isMaximized: true,
    })

    const restored = loadWindowState(
      userDataPath,
      createScreen([{ x: 0, y: 0, width: 1920, height: 1080 }]),
      defaults,
    )

    expect(restored).toEqual({
      bounds: { x: 360, y: 140, width: 1200, height: 800 },
      isMaximized: false,
    })
  })

  it('supports displays with negative coordinates', () => {
    const userDataPath = tempRoot()
    writeState(userDataPath, {
      version: 1,
      bounds: { x: -1500, y: 120, width: 1000, height: 700 },
      isMaximized: false,
    })

    const restored = loadWindowState(
      userDataPath,
      createScreen([
        { x: 0, y: 0, width: 1920, height: 1080 },
        { x: -1920, y: 0, width: 1920, height: 1080 },
      ]),
      defaults,
    )

    expect(restored.bounds).toEqual({ x: -1500, y: 120, width: 1000, height: 700 })
  })

  it('saves normal bounds and maximized state without persisting minimized windows', () => {
    const userDataPath = tempRoot()
    const saved = saveWindowState(
      userDataPath,
      createWindow({ x: 100, y: 120, width: 1400, height: 900 }, { maximized: true }),
    )

    expect(saved).toBe(true)
    expect(readState(userDataPath)).toEqual({
      version: 1,
      bounds: { x: 100, y: 120, width: 1400, height: 900 },
      isMaximized: true,
    })

    const skipped = saveWindowState(
      userDataPath,
      createWindow({ x: 0, y: 0, width: 900, height: 640 }, { minimized: true }),
    )

    expect(skipped).toBe(false)
    expect(readState(userDataPath).bounds).toEqual({ x: 100, y: 120, width: 1400, height: 900 })
  })

  it('debounces move and resize persistence', () => {
    vi.useFakeTimers()
    const userDataPath = tempRoot()
    const window = createWindow({ x: 15, y: 25, width: 930, height: 650 })
    const watcher = watchWindowState(userDataPath, window, { debounceMs: 50 })

    window.emit('move')
    window.emit('resize')

    expect(existsSync(getWindowStatePath(userDataPath))).toBe(false)
    vi.advanceTimersByTime(49)
    expect(existsSync(getWindowStatePath(userDataPath))).toBe(false)
    vi.advanceTimersByTime(1)
    expect(readState(userDataPath).bounds).toEqual({ x: 15, y: 25, width: 930, height: 650 })

    watcher.close()
  })
})
