# Manual Release Workflow

AisleNote releases are manual GitHub releases built with Electron Builder. In-app updates are intentionally not configured yet; `electron/update-service.mjs` remains a no-op.

## One-Time Setup

Confirm the checkout points at the AisleNote repository:

```sh
git remote -v
```

The `origin` remote should be `https://github.com/jcGeorge/AisleNote.git`.

## Build A Release Candidate

From a clean checkout:

```sh
npm ci
npm version <version>
npm run release:build
```

`npm run release:build` removes stale output, runs lint/type/test/build checks, and creates unsigned desktop artifacts in `release/`.

Platform notes:

- Windows builds are unsigned x64 portable executables. Windows SmartScreen warnings are expected.
- Linux builds target x64 AppImage plus unpacked output.
- macOS builds are unsigned zip artifacts. Gatekeeper warnings are expected until Developer ID signing and notarization are configured.

## Publish A Draft Prerelease

Use a dry run first:

```sh
npm run release:publish -- <version> --dry-run
```

Then publish the draft prerelease:

```sh
npm run release:publish -- <version>
```

The publish script requires `<version>` to match `package.json`, creates tag `v<version>` at the current commit if needed, uploads publishable files from `release/`, and marks the GitHub release as draft/prerelease by default.

Use `--ready` only after smoke testing if the release should be published as the latest non-prerelease GitHub release:

```sh
npm run release:publish -- <version> --ready
```

## Smoke Test Checklist

Before marking a release ready:

- Launch the unpacked app and the distributable artifact where the platform allows it.
- Create or open a vault.
- Create a note, quit, relaunch, and confirm the note persists.
- Verify file/image dialogs.
- Export a vault.
- Confirm external links open in the system browser.

Also inspect generated release output and confirm artifact names and metadata use `AisleNote`, not `Tabs`.
