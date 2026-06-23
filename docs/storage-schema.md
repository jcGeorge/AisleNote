# Storage Schema

This document describes the current desktop on-disk notebook format.

The notebook source of truth is the named notebook folder. It contains a root manifest, visible Markdown note files, imported/editor assets, and `.aislenote/` metadata files that preserve app structure and editor state. Electron user settings live outside the selected notebook folder at `<electron-user-data>/settings/app-settings.json` and move only through explicit user-settings import/export.

The design goals are:

- keep note body content in Markdown files where possible
- keep app structure and metadata in JSON files
- use stable IDs as durable identity
- allow duplicate visible names without collisions
- work with desktop filesystem sync and browser virtual-file storage
- degrade safely when optional metadata is missing

## Root Layout

```text
<notebook-folder>/
  manifest.json
  <root-note-title>--<id-hash>.md
  <folder-title>--<id-hash>/
    <note-title>--<id-hash>.md
    <multi-aisle-note-title>--<id-hash>/
      aisle 1--<id-hash>.md
      aisle 2--<id-hash>.md
  assets/
    asset-<content-hash>.<ext>
  .aislenote/
    notebook-index.json
    navigation-state.json
    note-registry.json
    trash-index.json
    frontmatter-settings.json
    editor-state.json
    messages.json
    sync-state.json

<electron-user-data>/
  settings/
    app-settings.json
```

Readable path segments include a title plus an ID-derived hash. Stable IDs remain the durable identity; path names are for human readability and collision avoidance.

## Core Rules

### IDs

Every durable object gets a stable opaque ID:

- folder
- note
- note body
- aisle
- aisle body
- deleted item
- asset

Visible titles are not required to be unique. Two notes can share the same title, and a folder and note can also share a title. The storage path hash disambiguates them.

### Names vs IDs

- IDs are used for identity and references.
- Titles are UI metadata and human-readable path hints.
- Renaming a folder or note may change the generated readable path on the next save, but identity is still preserved by IDs.

### Note Bodies

Note contents are stored in `.md` files.

- A note with one aisle is stored as `<note-title>--<id-hash>.md`.
- A note with multiple aisles is stored as a folder containing `aisle N--<id-hash>.md` files.
- The folder tree in `.aislenote/notebook-index.json` records the logical notebook hierarchy and the visible file paths.
- Shared aisle bodies can have multiple visible Markdown mirrors. On load, the newest changed mirror wins and is written back to every mirror on the next save.
- Aisle bodies without a visible Markdown mirror, such as deleted or scratchpad-only content, are preserved in `.aislenote/note-registry.json`.

User frontmatter values live inside the aisle Markdown file as a top YAML block. `note-registry.json` keeps note-body IDs, aisle slots, shared aisle-body IDs, content hashes, derived tag caches, and internal `frontmatterMeta`, keyed by `aisleBodyId`.

Tags are authored as visible Obsidian-style hashtags in aisle Markdown, such as `#tag`, `#multi-word`, and `#nested/tag`. The app derives aisle tags from visible Markdown text and note tags from the union of that note's aisle tags. Hashtags inside inline code and fenced code blocks are ignored. If valid YAML frontmatter already contains `tags`, the loader migrates those tags into a visible hashtag line in the Markdown body and then treats YAML `tags` as a computed projection of the visible tags.

Example aisle file:

```md
---
status: ready
created: 2024-01-01
---

Markdown body text.
```

### Assets

Images and similar binary files are stored under `assets/`.

Markdown references assets with `aislenote-asset:///assets/...` URLs inside the app. Runtime/editor layers may inline those files temporarily for rendering or editing, but saves keep the asset files on disk.

Active asset cleanup uses the save pass that writes Markdown. Each save rebuilds the expected file list from live notes, aisle bodies, and preserved content, then prunes generated Markdown files that are no longer expected. The `assets/` folder is preserved by that Markdown prune pass.

Video resize, rotate, flip, and crop operations are metadata-only. They keep the original asset file and store display metadata in a `#aislenote-media=...` URL fragment on the Markdown link. Crop rectangles use normalized source coordinates, so no resized or transcoded video copy is created by default.

Example:

```md
![diagram](aislenote-asset:///assets/asset-0123456789abcdef.png)
```

### Trash

Trash is modeled explicitly, not as a boolean field on active notes.

`.aislenote/trash-index.json` tracks deleted notebook items, their original parent folder/index, and deletion timestamps. Deleted note bodies and aisle bodies remain available through `.aislenote/note-registry.json`.

## Manifest Responsibilities

### Root Manifest

`manifest.json`

Stores:

- `schemaVersion: 2`
- `notebookId`
- `createdBy: "aislenote"`
- `files`: paths to the `.aislenote/` split files
- optional sync metadata

Does not store:

- user settings
- deleted item content
- note-body or aisle-body registries
- Markdown body text
- user frontmatter values
- binary asset contents
- the full notebook tree

Example:

```json
{
  "schemaVersion": 2,
  "notebookId": "notebook-id",
  "createdBy": "aislenote",
  "files": {
    "notebookIndex": ".aislenote/notebook-index.json",
    "navigationState": ".aislenote/navigation-state.json",
    "noteRegistry": ".aislenote/note-registry.json",
    "trashIndex": ".aislenote/trash-index.json",
    "frontmatterSettings": ".aislenote/frontmatter-settings.json",
    "editorState": ".aislenote/editor-state.json",
    "messages": ".aislenote/messages.json",
    "syncState": ".aislenote/sync-state.json"
  },
  "syncMetadata": null
}
```

### Split Files

All split files live under `.aislenote/`.

- `notebook-index.json`: active note ID, notebook folder/note tree, generated file paths, and notebook settings.
- `navigation-state.json`: active note ID and view mode.
- `note-registry.json`: note body records and aisle body records, including content hashes, frontmatter metadata, tags, inline preserved Markdown, and mirror paths.
- `trash-index.json`: deleted notebook items and restore metadata.
- `frontmatter-settings.json`: frontmatter templates, selected settings template, and last applied template.
- `editor-state.json`: theme, scratchpad, hotkeys, UI state, toast history, cursor locations, heading collapse state, and aisle widths.
- `messages.json`: persisted app messages.
- `sync-state.json`: sync metadata.

Portable user preferences live in `<electron-user-data>/settings/app-settings.json`, not in the selected notebook folder. Missing optional split files fall back to defaults where the loader has a defined fallback.

## Import Behavior

Notebook imports replace the current notebook folder contents. Supported import sources are:

- AisleNote notebook folders
- AisleNote notebook ZIPs
- Markdown folders
- Markdown ZIPs

Markdown import maps every Markdown file to one note and every containing directory to a notebook folder. Root Markdown files become root notes. Frontmatter, visible tags, resolvable Obsidian links, and local assets are converted into the app's notebook model where possible.

## Recommended Field Strategy

Use these principles consistently:

- `id`: stable opaque identifier
- `title`: human-facing label stored in metadata
- `path`: relative readable storage path for folders or multi-aisle notes
- `file`: relative path to a Markdown file
- `deletedAt`: Unix epoch milliseconds
- `createdAt` / `updatedAt`: ISO strings where available
- `schemaVersion`: integer storage format gate
- `editor-state.json.noteCursorLocations`: optional map keyed by note ID
- `editor-state.json.aisleWidths`: optional map keyed by note ID, with fixed aisle widths by aisle ID

## Validation And Health

Current health behavior:

- The root manifest `schemaVersion` is the format gate. Schema 2 is the current desktop write format.
- Unsupported root manifest versions are load-blocking to avoid silently overwriting real data.
- Missing or corrupt required metadata blocks loading.
- Missing optional metadata falls back to defaults where supported.
- Missing visible Markdown mirrors fall back to preserved registry Markdown when possible.
- Cloud-provider conflict folders are load-blocking until resolved.
- Saves write through replacement where possible and pause when load-blocking errors are detected.

Storage health UI should surface:

- current notebook folder path
- schema version
- writable/paused state
- notebook folder health (`healthy`, `warning`, or `error`)
- issue codes/messages/paths
- reveal folder and retry reload actions

## Browser Adapter

Browser builds persist the same logical notebook tree in IndexedDB as virtual files. Browser and mobile runtimes may keep an app-private virtual `notes/` prefix internally because it is not a user-visible filesystem notebook folder.

Browser storage should remain logically compatible with the Electron filesystem adapter for:

- folders and notes
- deleted items
- multiple aisles
- assets
- frontmatter, including null date/datetime values
- scratchpad content

## Legacy Storage

Pre-production notebook folders are not loaded or migrated. Electron expects `manifest.json` at the notebook root for an existing notebook folder. Unsupported schema versions are not silently migrated or overwritten.
