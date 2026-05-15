export function finishCloseAfterFlush({ app, window, quitRequested }) {
  if (quitRequested) {
    app.quit()
    return 'quit'
  }

  if (!window.isDestroyed()) {
    window.close()
    return 'close-window'
  }

  return 'window-destroyed'
}
