# Storage Schema

This document describes the current schema 1 on-disk storage format for the app.

The current notebook source of truth is a `notes/` folder with a tiny root manifest, root-level notebook registries, domain manifests, space manifests, Markdown note files, and asset files. In Electron, active user settings live outside the selected notebook folder at `<electron-user-data>/settings/app-settings.json` and are transferred only through explicit user-settings import/export. A future `topics/` layer may be introduced later, but it is not part of the active schema 1 layout.

The design goals are:

- keep note bodies in Markdown files
- keep app structure and metadata in manifest JSON files
- use stable IDs as the source of truth
- allow duplicate visible names without collisions
- work well with desktop filesystem sync and browser virtual-file storage
- degrade safely when non-root branches are missing or corrupt

## Root Layout

```text
<notebook-folder>/
  notes/
    manifest.json
    workspace-index.json
    navigation-state.json
    frontmatter-settings.json
    editor-state.json
    deleted-workspace.json
    note-registry.json
    domains/
      <domain-title>--<id-hash>/
        manifest.json
        <space-title>--<id-hash>/
          manifest.json
          <parent-tab-title>--<id-hash>/
            home.md
            home/
              aisle 1--<id-hash>.md
              aisle 2--<id-hash>.md
            <sub-tab-title>--<id-hash>.md
            <sub-tab-title>--<id-hash>/
              aisle 1--<id-hash>.md
              aisle 2--<id-hash>.md
          trash/
            manifest.json
            <deleted-title>--<id-hash>/
              home.md
              <nested-sub-tab-title>--<id-hash>.md
            <deleted-sub-tab-title>--<id-hash>.md
      ...
    _internal/
      orphan-bodies/
        <orphan-title>--<id-hash>.md
        <orphan-title>--<id-hash>/
          aisle 1--<id-hash>.md
          aisle 2--<id-hash>.md
    assets/
      asset-<content-hash>.<ext>

<electron-user-data>/
  settings/
    app-settings.json
```

Readable path segments include a title plus an ID-derived hash. Stable IDs remain the durable identity; path names are for human readability and collision avoidance.

For notes, a single aisle is stored as one Markdown file. A note folder is used only when that note currently has multiple aisles.

Electron recovery snapshots are stored outside the synced `notes/` tree:

```text
<electron-user-data>/
  storage-recovery/
    notes-<timestamp>/
```

## Core Rules

### IDs

Every durable object gets a stable opaque ID:

- domain
- space
- parent tab
- sub-tab
- note body
- aisle
- trash item
- asset

Visible titles are not required to be unique.

Examples that are allowed:

- two parent tabs named `Notes`
- two sub-tabs named `Ideas` under the same parent
- a parent tab and a sub-tab with the same title

### Names vs IDs

- IDs are used for identity and references.
- Titles are UI metadata and human-readable path hints.
- Renaming a domain, space, tab, or sub-tab may change the generated readable path on the next save, but identity is still preserved by IDs.

### Note Bodies

Note contents are stored in `.md` files.

- parent tab home note with one aisle: `<space>/<parent-tab>/home.md`
- parent tab home note with multiple aisles: `<space>/<parent-tab>/home/aisle N--<id-hash>.md`
- sub-tab note with one aisle: `<space>/<parent-tab>/<sub-tab>--<id-hash>.md`
- sub-tab note with multiple aisles: `<space>/<parent-tab>/<sub-tab>--<id-hash>/aisle N--<id-hash>.md`
- unlinked note bodies use the same single-file or multi-aisle-folder rule under `_internal/orphan-bodies/`

User frontmatter values live inside the aisle Markdown file as a top YAML block. `note-registry.json` keeps note-body IDs, aisle slots, shared aisle-body IDs, file references, and internal `frontmatterMeta`, keyed by shared `aisleBodyId`. Unlinked preservation records are marked with `storageStatus: "unlinked"` and keep their Markdown under `_internal/orphan-bodies/`.

Example aisle file:

```md
---
status: ready
created: 2024-01-01
---
Markdown body text.
```

### Assets

Images and similar binary files are stored under `notes/assets/`.

Markdown references assets with relative paths. Runtime/editor layers may inline those files temporarily for rendering or editing, but saves write assets back out as normal files.

Active asset cleanup uses the same save pass that writes Markdown. Each save rebuilds the expected file list from live notes, aisle bodies, unlinked note bodies, and trash/deleted content, then prunes files in `notes/` that are not in that expected set. Image resize changes only the persisted image metadata fragment and does not create a new image file. Image crop and transform operations can create immediate preview assets, but any unreferenced intermediate assets in the active `notes/assets/` folder are removed by the next save/prune pass.

Recovery snapshots are exact historical copies of `notes/`, including the asset files from that moment. They are stored outside the active `notes/` tree and pruned by retention policy rather than sharing the latest active asset versions.

Example:

```md
![diagram](../../../../assets/asset-0123456789abcdef.png)
```

### Trash

Trash is modeled explicitly, not as a boolean field on active notes.

Each space has a trash manifest:

```text
notes/domains/<domain>/<space>/trash/manifest.json
```

The trash manifest tracks:

- what was deleted
- original parent/sub-tab IDs
- deletion timestamp
- Markdown file paths for deleted note content
- nested sub-tabs for deleted parent tabs
- source parent tab title for loose deleted sub-tabs

## Manifest Responsibilities

### Root Manifest

`notes/manifest.json`

Stores:

- `schemaVersion: 1`
- `files`: a map of root split-file roles to sibling JSON file names

Does not store:

- app settings
- deleted workspace data
- note-body or aisle-body registries
- Markdown body text
- user frontmatter values
- binary asset contents
- full domain/space tab trees

Example:

```json
{
  "schemaVersion": 3,
  "files": {
    "workspaceIndex": "workspace-index.json",
    "navigationState": "navigation-state.json",
    "appSettings": "app-settings.json",
    "frontmatterSettings": "frontmatter-settings.json",
    "editorState": "editor-state.json",
    "deletedWorkspace": "deleted-workspace.json",
    "noteRegistry": "note-registry.json"
  }
}
```

### Root Split Files

All root split files live directly under `notes/`, beside `manifest.json`.

- `workspace-index.json`: domain order, domain titles, and domain paths.
- `navigation-state.json`: `activeDomainId` and optional `lastOpened`.
- `frontmatter-settings.json`: frontmatter templates, selected settings template, and last applied template.
- `editor-state.json`: note cursor locations and heading collapse state.
- `deleted-workspace.json`: deleted domains and deleted spaces.
- `note-registry.json`: note body records and shared aisle body records, including unlinked preservation records marked with `storageStatus: "unlinked"`.

Portable user preferences live in `<electron-user-data>/settings/app-settings.json`, not in the selected notebook folder's `notes/`. Missing required split files block load. Missing optional `editor-state.json` falls back to defaults.

### Domain Manifest

`notes/domains/<domain-title>--<id-hash>/manifest.json`

Stores:

- domain ID
- domain title
- space ordering and space paths
- active/default space

### Space Manifest

`notes/domains/<domain-title>--<id-hash>/<space-title>--<id-hash>/manifest.json`

Stores:

- space ID
- space title
- per-space settings
- parent tab ordering
- parent tab titles, IDs, note-body IDs, and home note paths
- sub-tab ordering
- sub-tab titles, IDs, note-body IDs, and file paths
- active parent tab
- active sub-tab per parent tab
- trash manifest path

Does not store Markdown body text or asset binary contents.

### Trash Manifest

`notes/domains/<domain>/<space>/trash/manifest.json`

Stores:

- trash item ID
- deleted item type (`parent-tab` or `subtab`)
- original parent/sub-tab IDs
- deletion timestamp
- Markdown file path
- nested deleted sub-tabs for deleted parent tabs
- `activeSubTabId` for deleted parent tabs
- `parentTabTitle` for loose deleted sub-tabs

## Recommended Field Strategy

Use these principles consistently:

- `id`: stable opaque identifier
- `title`: human-facing label stored in manifests
- `path`: relative readable storage path
- `file`: relative path to a Markdown file
- `deletedAt`: Unix epoch milliseconds
- `createdAt` / `updatedAt`: ISO strings on note bodies where available
- `schemaVersion`: integer storage format gate
- `editor-state.json.noteCursorLocations`: optional map keyed by domain/space/parent/sub-tab location

## Validation And Recovery

Current recovery behavior:

- The root manifest `schemaVersion` is the format gate. Schema 1 is the current write format.
- Missing, corrupt, or unsupported root manifests are load-blocking to avoid silently overwriting real data.
- Missing required schema 1 root split files are load-blocking. Missing optional editor split files fall back to defaults.
- Missing Markdown files load as empty note content and create a warning.
- Missing or corrupt trash manifests load as empty trash for that space and create a warning.
- Missing or corrupt space manifests skip only that space where another readable space remains.
- Missing or corrupt domain manifests skip only that domain where another readable domain remains.
- If no readable domains remain, loading fails and writes are paused.
- Cloud-provider conflict folders are load-blocking until resolved.
- Saves create pre-write recovery snapshots outside the synced `notes/` tree when Electron user-data is available.

Recovery UI should surface:

- current notebook folder path
- schema version
- writable/paused state
- notebook folder health (`healthy`, `warning`, or `error`)
- issue codes/messages/paths
- recovery snapshot count
- reveal folder, retry reload, backup, and restore snapshot actions

## Browser Adapter

Browser builds persist the same logical `notes` tree in IndexedDB as virtual files.

Browser storage should remain logically compatible with the Electron filesystem adapter for:

- domains and spaces
- parent tabs and sub-tabs
- trash
- multiple aisles
- assets
- frontmatter, including null date/datetime values
- unlinked note bodies

## Legacy Storage

Pre-production notebook folders and old app-state backup archives are not loaded or migrated. A missing `notes/` folder loads as an empty notebook and is recreated on save. Unsupported schema versions are not silently migrated or overwritten.

## Future Topic Layer

The top-level `topics/` directory is reserved for a future migration only.

If the product later introduces concepts like topics, worlds, or sectors, the migration should be explicit and test-backed. Until then, the current schema 1 `domains/` layout is canonical.
