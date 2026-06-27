# AisleNote

AisleNote is a local-first React/Electron note workspace with vaults, folders, notes, trash, aisles, image handling, and keyboard shortcuts.

## Architecture Map

- `src/App.tsx` is still the main shell, but persistence and trash selection live in focused hooks under `src/storage/` and `src/trash/`.
- `src/state/` owns durable app-state normalization, domain projection, workspace creation, trash purging, and legacy migration.
- `src/editor/` wraps Toast UI Editor and ProseMirror internals. Keep editor-specific `any` usage inside this boundary.
- `src/storage/` owns the hybrid manifest/Markdown storage adapter. Browser IndexedDB and Electron filesystem storage share common helpers in `hybrid-storage-core.js`.
- `electron/` owns the desktop shell, preload bridge, filesystem storage adapter, export archive creation, and native menu shortcuts.

## Storage Model

Runtime state remains an `AppState` object, but durable storage is moving toward the manifest/Markdown/assets model documented in `docs/storage-schema.md`.

- Manifests hold structure, IDs, ordering, active locations, settings, and trash metadata.
- Markdown note bodies are written separately from manifests.
- Images are externalized into `assets/` when possible and inlined again for editor/runtime loading.
- Stable IDs are the source of truth. Visible names are UI labels and do not need to be unique.

When changing storage behavior, add or update a round-trip test before editing serializer logic.

## Planning Docs

- `docs/roadmap.md` tracks the recommended stabilization, refactor, UI/UX, desktop, and PWA/mobile sequence.
- `docs/storage-schema.md` defines the target manifest/Markdown/assets storage model.

## Editor Caveats

- Toast UI Editor exposes ProseMirror internals that are not fully typed. Keep those accesses behind `src/editor/` helpers where practical.
- Markdown persistence normalizes internal indentation tokens and repairs broken data-image Markdown.
- Aisles are part of note bodies, not separate notes. Keep the legacy `homeContent` and `content` mirrors synchronized with `noteBodies`.
- Keyboard and multiline editing behavior has Electron menu integration; verify desktop shortcuts when changing editor event handling.

## Commands

```sh
npm run dev
npm run electron:dev
npm run start:mac
npm run start:windows
npm run package:win
npm run lint
npx tsc -b --pretty false --noEmit
npm test
npm run build
```

`npm run start:mac` and `npm run start:windows` both build the app and launch Electron through the cross-platform Node launcher in `scripts/start-electron.mjs`.

## Windows Portable Build

For MVP testing on a Windows x64 computer, build an unsigned portable executable from a fresh install:

```sh
npm ci
npm run package:win
```

The expected output is `release/AisleNote-0.0.0-x64-portable.exe`. Electron Builder also creates an unpacked app folder under `release/win-unpacked/`; smoke test both `release/win-unpacked/AisleNote.exe` and the portable `.exe`.

The MVP smoke test is: open the app, create the default vault, save a note, close and reopen with the data still present, verify file/image dialogs, export a vault, and confirm external links open in the browser. The executable is unsigned, so Windows SmartScreen warnings are expected.

`npm run lint` is expected to exit successfully. Existing `react-hooks/exhaustive-deps` warnings mark known ref-heavy areas that should be retired as those controllers are split.

## Do Not Break

- Legacy JSON state must still parse through `parseSavedState`.
- Browser hybrid storage must round-trip manifest and Markdown content.
- Electron storage must preserve the same logical schema as browser storage.
- Trash restore/delete flows must preserve original parent/sub-tab relationships.
- Export should keep Markdown readable and externalize image assets where possible.
