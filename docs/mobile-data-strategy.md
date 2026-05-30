# Cross-Platform Data Strategy

Tabs uses different storage capabilities by runtime. The data format stays portable, but folder control is not treated as universal.

## Desktop

- Notebook content lives in a user-selected notebook folder containing `notes/`.
- User settings can live in a separate user-selected settings folder containing `settings/app-settings.json`.
- Backups, recovery snapshots, folder switching, folder moves, and live filesystem reload are desktop features.
- Desktop can use OS/cloud-synced folders because the operating system owns that sync behavior.

## Mobile And Tablet

- Notebook content lives in app-private storage.
- Transfers use notebook archive import/export/share.
- User settings transfer explicitly through `app-settings.json` import/export/share.
- Recovery uses app-private notebook archive copies.
- Live notebook folders and live settings folders are unsupported for v1 on iOS, iPadOS, and Android.

Capacitor filesystem access is intentionally scoped to app-private storage for v1. Android 11+ and iOS file-provider behavior make arbitrary live cloud folders a separate native sync problem, not a small adapter change.

## Browser

- Notebook content lives in IndexedDB, with localStorage as the synchronous startup cache.
- Transfers use downloaded/uploaded notebook archives and `app-settings.json`.
- Browser builds do not expose notebook folder switching, settings folders, backups, or live filesystem reload.

## Product Default

- Free desktop: local notebook folder, with optional OS-managed cloud folders.
- Free mobile/tablet: local app-private notebook, manual archive transfer.
- Future hosted sync: account-backed sync service, not OS-folder sync on mobile.
