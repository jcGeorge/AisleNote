# Storage Schema

This document defines the future on-disk storage format for the app.

The design goals are:

- keep note bodies in Markdown files
- keep app structure and metadata in manifest JSON files
- use stable IDs as the source of truth
- allow duplicate visible names without collisions
- leave room for a future top-level `topic` layer
- work well with desktop filesystem sync and later browser/mobile adapters

## Root Layout

```text
notes-data/
  manifest.json
  topics/
    <topic-id>/
      manifest.json
      spaces/
        <space-id>/
          manifest.json
          notes/
            <tab-id>/
              home.md
              subtabs/
                <subtab-id>.md
          assets/
            <asset-id>.<ext>
          trash/
            manifest.json
            notes/
              <trash-item-id>.md
            assets/
              <asset-id>.<ext>
```

## Core Rules

### IDs

Every durable object gets a stable opaque ID:

- topic
- space
- parent tab
- sub-tab
- trash item
- asset

Visible titles are not required to be unique.

Examples that are allowed:

- two parent tabs named `Notes`
- two sub-tabs named `Ideas` under the same parent
- a parent tab and a sub-tab with the same title

### Names vs IDs

- IDs are used for identity, references, and file paths
- Titles are UI metadata only
- Renaming a tab or sub-tab should not require renaming files

### Note Bodies

Note contents are stored in `.md` files.

- parent tab hidden home note: `notes/<tab-id>/home.md`
- sub-tab note: `notes/<tab-id>/subtabs/<subtab-id>.md`

### Assets

Images and similar binary files are stored as normal files under `assets/`.

Markdown should reference assets using relative paths.

The on-disk files are the source of truth. Runtime/editor layers may still inline
those files temporarily for rendering or editing, but saves should write assets back
out as normal files.

Example:

```md
![diagram](../../assets/asset_001.png)
```

### Trash

Trash is modeled explicitly, not as a boolean field on active notes.

The trash manifest tracks:

- what was deleted
- original location
- deletion timestamp
- which markdown file belongs to the trashed item
- for deleted parent tabs, the home note file plus nested sub-tab note files

## Manifest Responsibilities

### Root Manifest

`notes-data/manifest.json`

Stores:

- schema version
- app-level settings
- topic ordering
- active topic
- optional last-opened navigation context

Does not store:

- note body markdown
- binary asset contents

### Topic Manifest

`notes-data/topics/<topic-id>/manifest.json`

Stores:

- topic ID
- topic title
- space ordering
- active/default space
- optional topic-scoped settings

### Space Manifest

`notes-data/topics/<topic-id>/spaces/<space-id>/manifest.json`

Stores:

- space ID
- space title
- per-space settings
- parent tab ordering
- parent tab titles and IDs
- home note path for each parent tab
- sub-tab ordering
- sub-tab titles, IDs, and file paths
- active parent tab
- active sub-tab per parent tab if we decide to persist that state
- trash manifest path

Does not store:

- markdown body text
- asset binary contents

### Trash Manifest

`notes-data/topics/<topic-id>/spaces/<space-id>/trash/manifest.json`

Stores:

- trash item ID
- deleted item type (`tab-home`, `subtab`, `parent-tab`)
- original topic/space/tab/sub-tab location
- deletion timestamp
- markdown file path
- for deleted parent tabs:
  - the `file` field points to the parent tab home note markdown file
  - `subTabs` stores nested deleted sub-tab records and markdown paths
  - `activeSubTabId` can preserve which deleted sub-tab was active
- for deleted sub-tabs:
  - `parentTabTitle` preserves the source parent tab title for the trash UI
- optional asset references

## Recommended Field Strategy

Use these principles consistently:

- `id`: stable opaque identifier
- `title`: human-facing label
- `file`: relative path to a markdown file
- `deletedAt`: Unix epoch milliseconds
- `createdAt` / `updatedAt`: Unix epoch milliseconds where needed
- `schemaVersion`: integer for migration handling

## Why This Model

Compared with a single JSON blob:

- easier to inspect and debug
- better for sync and backups
- content stays user-readable

Compared with markdown-only storage:

- preserves app structure cleanly
- supports hidden home notes, ordering, trash, and settings

## Validation And Recovery

- The root manifest `schemaVersion` is the format gate. Unsupported versions should not be loaded as if they were current data.
- Missing note markdown files should degrade to empty note content rather than failing the whole workspace load.
- Missing or corrupt trash manifests should degrade to empty trash for that space.
- Missing or corrupt space manifests should trigger a best-effort recovery from the `notes/` folder for that space.
- The app may keep a previous full storage snapshot on disk for fallback recovery if the current tree becomes unreadable.

## Browser Adapter

- Browser builds can persist the same logical `notes-data` tree in IndexedDB as virtual files.
- A small local cache may still be used for synchronous bootstrapping, but the durable browser representation should follow the same manifest/markdown/assets layout.

## Future Topic Layer

The top-level `topics/` directory is intentionally included now.

If the product later introduces concepts like:

- topics
- worlds
- sectors

the storage model already has room for it.

If the app launches before topics are exposed in the UI, a single default topic can be used.
