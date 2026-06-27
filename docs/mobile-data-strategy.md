# Cross-Platform Data Strategy

AisleNote uses different storage capabilities by runtime. The current release target is desktop; non-desktop persistence is not treated as a schema-compatible vault format.

## Desktop

- Vault content lives in a user-selected named vault folder containing root-level `manifest.json`, visible Markdown folders/notes, `.aislenote/` metadata, and `assets/`.
- User settings can live in a separate user-selected settings folder containing `settings/app-settings.json`.
- Folder export/import, folder switching, folder moves, and live filesystem reload are desktop features.
- Desktop can use OS/cloud-synced folders because the operating system owns that sync behavior.

## Mobile And Tablet

- Future vault content should live in app-private storage.
- Full-vault folder export is unavailable.
- User settings transfer explicitly through `app-settings.json` import/export/share.
- Live vault folders and live settings folders are unsupported for v1 on iOS, iPadOS, and Android.

Android 11+ and iOS file-provider behavior make arbitrary live cloud folders a separate native sync problem, not a small adapter change.

## Browser

- Browser builds currently use local renderer cache persistence only.
- Browser builds do not expose full-vault export, vault folder switching, settings folders, or live filesystem reload.
- Markdown ZIP import and `app-settings.json` transfer remain available.

## Product Default

- Free desktop: local vault folder, with optional OS-managed cloud folders and explicit folder export/import.
- Future mobile/tablet: local app-private vault, with no full-vault export.
- Future hosted sync: account-backed sync service, not OS-folder sync on mobile.
