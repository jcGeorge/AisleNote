# Tabs Roadmap

This roadmap prioritizes stabilizing the local-first product core before broad UI overhaul, desktop release work, or PWA/mobile packaging.

The guiding rule is: data integrity and recovery come before visual polish and platform expansion.

## Phase 1: Stabilization Pass

Goal: prove the app can preserve user data through normal and stressful workflows.

Focus areas:

- Frontmatter templates, computed values, default values, derived rows, manual rows, null date/datetime values, and template switching.
- Director/Stage Manager operations, including frontmatter application, note movement, migration, deletion, and review flows.
- Rename persistence for domains, spaces, parent tabs, and sub-tabs.
- Trash restore/delete behavior for parent tabs, sub-tabs, nested sub-tabs, and permanently deleted items.
- Export behavior, including readable Markdown output and image asset handling.
- Cloud-folder sync behavior through Electron storage profile selection, move, reveal, retry, watcher reload, and app restart.

Exit criteria:

- Every bug found during manual testing gets a regression test before the fix lands.
- A real workspace survives rename, move, delete, restore, frontmatter edits, image edits, app restart, and storage reload.
- Existing `npm test`, `npm run build`, and `npm run lint` remain usable as the core verification baseline.

Manual test matrix:

- Create domain, space, parent tab, sub-tab, and multiple aisles; rename each item and restart.
- Apply frontmatter manually, by template, and through Director; verify computed values update from note/domain/space state.
- Move and delete selected notes through Stage Manager; restore from trash and verify note body identity is preserved.
- Resize, crop, rotate, and export images.
- Choose a sync folder, move existing data, restart Electron, edit externally where practical, and retry reload.

## Phase 2: Storage And Sync Hardening

Goal: make the manifest/Markdown/assets storage model resilient enough for real user data.

Focus areas:

- Align implementation behavior with `docs/storage-schema.md`.
- Add recovery behavior for missing Markdown files, missing/corrupt manifests, missing assets, interrupted saves, and stale revisions.
- Add user-visible storage health and recovery actions.
- Preserve legacy JSON parsing and migration behavior.

Exit criteria:

- Browser and Electron storage adapters round-trip the same logical state.
- Corrupt or missing content degrades safely instead of losing the whole workspace.
- Users can export a backup, reveal the data folder, and recover from the most common storage failures.

## Phase 3: Targeted Refactor

Goal: reduce risk in future feature work without doing a broad rewrite.

Refactor only after Phase 1 regression coverage exists.

Priority surfaces:

- `src/App.tsx`: split shell orchestration from feature controllers.
- Settings and frontmatter controllers: separate draft state, persistence, and UI-specific behavior.
- Editor/image tools: keep Toast UI and ProseMirror internals behind editor-local helpers.
- Stage Manager: keep selection, validation, transformation, and view coordination isolated.
- Hook dependency warnings: retire ref-heavy patterns where a narrower controller would make dependencies stable.

Exit criteria:

- Refactors are behavior-preserving and test-backed.
- Module ownership is clearer than before the refactor.
- No unrelated UI redesign is bundled into refactor commits.

## Phase 4: UI/UX Stabilization And Input Polish

Goal: clean up known workflow and editor-input rough edges before the broader visual redesign.

First-pass focus areas:

- Tab-after-naming flow for parent tabs and sub-tabs.
- Assignable previous/next parent-tab hotkeys, unbound by default.
- Markdown input polish for blockquotes, pasted lists, and multi-cursor list commands.
- Small positioning, icon, and theme fixes that are clearly bugs rather than redesign work.

Later Phase 4 slices should define the design-system foundation before the full UI overhaul:

- Spacing scale, typography scale, icon style, control sizing, focus states, disabled states, and touch targets.
- Theme token model for app shell, editor, settings, modals, toolbars, Stage Manager, trash, and storage UI.
- Accessibility expectations for keyboard flow, contrast, modal focus, tooltip controls, and screen-reader labels.
- Mobile/touch rules for editor controls and navigation.

Custom user themes should wait until the internal token model is stable.

## Phase 5: Tooltip And Mobile Editing Controls

Goal: make editor controls configurable and usable without a physical keyboard.

Focus areas:

- Configurable tooltip actions.
- Overflow or dropdown placement for low-use actions.
- Undo and redo buttons for mobile users.
- Touch-friendly hit targets and predictable toolbar positioning.

Exit criteria:

- Users can hide or move actions they do not use.
- Mobile users can perform undo/redo and common formatting without keyboard shortcuts.
- Tooltip changes do not disrupt desktop keyboard workflows.

## Phase 6: Guidance And Tips

Goal: teach workflows after those workflows are stable.

Focus areas:

- Lightweight tips surface instead of a large static manual.
- Contextual tips for first use of domains, spaces, tabs, sub-tabs, aisles, frontmatter, Stage Manager, and storage.
- Workflow tip for pressing Tab after naming a domain, space, parent tab, or sub-tab once that behavior exists.

Exit criteria:

- Tips are dismissible or unobtrusive.
- Tips describe implemented behavior only.
- Tips do not block expert users.

## Phase 7: Higher-Level Frontmatter Controls

Goal: expand frontmatter power after frontmatter semantics are stable.

Focus areas:

- Apply frontmatter templates to selected notes through Director.
- Support preview/review before applying batch metadata changes.
- Handle conflicts between existing note frontmatter and template-derived fields.
- Keep derived/manual/computed behavior clear in batch operations.

Exit criteria:

- Batch frontmatter changes are reviewable before commit.
- Existing note metadata is not silently destroyed.
- Tests cover mixed manual, derived, computed, and null date/datetime cases.

## Phase 7.5: Import Compatibility Spike

Goal: understand external note-app exports before committing to importer UX.

Focus areas:

- Collect or synthesize fixtures for Obsidian, OneNote, Apple Notes, generic Markdown folders, and generic HTML exports.
- Define fixture expectations for Markdown conversion, image assets, nested notebooks/folders, frontmatter-like metadata, links, tags, and unsupported content.
- Add parser spikes and tests only where the export format is stable enough to evaluate.
- Document what can be imported losslessly, what needs review, and what should be left unsupported.

Exit criteria:

- Importer risk is understood before any user-facing import UI is built.
- A fixture matrix exists for the first supported importer target.
- Import work does not weaken the current local-first storage model.

## Phase 8: Desktop Deployment Prep

Goal: prepare macOS and Windows releases before full PWA/mobile release.

Focus areas:

- Choose Electron Builder or Electron Forge and document the packaging workflow.
- App identity, icons, metadata, installer strategy, Windows packaging, macOS packaging, signing/notarization, and update channels.
- Crash-safe saves and storage migration guarantees.
- Export/backup/recovery flows suitable for non-developer users.
- Electron menu behavior and keyboard shortcuts on macOS and Windows.

Exit criteria:

- A clean machine can install, launch, choose storage, create notes, restart, and update without data loss.
- Storage profile and backup behavior are understandable from inside the app.
- Release checklist passes on macOS and Windows.

## Phase 9: PWA And Mobile Deployment Prep

Goal: add PWA/mobile infrastructure after mobile editing UX is credible.

Focus areas:

- Web app manifest, service worker, install prompts, offline boot, and update behavior.
- IndexedDB durability and recovery.
- iOS Safari limitations, Android behavior, and Android-compatible desktop/PWA targets such as AluminiumOS.
- Touch ergonomics for editing, navigation, tooltip controls, and settings.
- File access limitations compared with Electron storage folders.

Exit criteria:

- The app boots offline after installation.
- Browser storage failure modes are documented and recoverable.
- Mobile editing can complete core workflows without desktop-only shortcuts.

## Release Candidate Checklist

Run this checklist before any public release candidate.

Data and persistence:

- Legacy JSON state parses.
- Browser hybrid storage round-trips manifest, Markdown, and assets.
- Electron filesystem storage round-trips manifest, Markdown, and assets.
- Rename, reorder, move, delete, restore, and export preserve stable IDs.
- Sync folder move/retry/reload works after app restart.

Editing:

- Markdown editing, multiline editing, aisles, undo/redo, image resize/crop/rotate, and note preview work.
- Mobile/touch users can access core editor actions.
- Keyboard shortcuts work on macOS and Windows.

Frontmatter:

- Manual fields, template fields, computed values, derived rows, date/datetime pickers, null values, and Director application behave as expected.
- Exported Markdown remains readable.

UX and accessibility:

- Keyboard-only navigation works.
- Modal focus behavior is predictable.
- Contrast is acceptable for all themes.
- Tooltip and context menu controls are discoverable and touch-friendly.

Performance:

- Large workspaces remain responsive.
- Many images do not break editor or export behavior.
- Heavy frontmatter templates do not stall common workflows.

## Product Defaults

- Keep the app local-first.
- Prefer desktop release readiness before full PWA/mobile release.
- Keep refactors incremental and behavior-preserving.
- Do not add broad new feature surfaces until storage, frontmatter, and recovery behavior are stable.
