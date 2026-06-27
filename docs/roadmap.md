# AisleNote Roadmap

This roadmap prioritizes stabilizing the local-first product core before broad UI overhaul, desktop release work, or PWA/mobile packaging.

The guiding rule is: data integrity and recovery come before visual polish and platform expansion.

## Status Snapshot

Cleaned up on 2026-05-17.

- **Phase 1 is complete.** The stabilization pass covered real-workspace persistence, frontmatter, batch note workflows, rename persistence, trash/restore, export/images, and vault-folder reload/move behavior.
- **Phase 2 is complete for the current storage model.** The active manifest/Markdown/assets format is documented, Electron/browser storage behavior is hardened, vault-folder health is visible in settings, and global user settings are separated from selected vault folders.
- **Phase 3 is complete for this roadmap gate.** The first targeted refactor pass extracted vault-folder orchestration and cleared the hook-dependency cleanup target. Larger refactor slices are now normal engineering hygiene, not blockers for Phase 4.
- **Phase 4 is the current active phase.** The first input-polish slice is largely implemented; remaining Phase 4 work is continued bug polish plus the later design-system/UI overhaul.

## Phase 1: Stabilization Pass — Complete

Goal: prove the app can preserve user data through normal and stressful workflows.

Completed outcomes:

- Frontmatter templates, computed values, default values, manual rows, derived rows, null date/datetime values, picker behavior, and template switching were tested and fixed where needed.
- Batch note operations were exercised for frontmatter application, note movement, deletion, restore, and review flows.
- Rename persistence for folders and notes was validated across app restart/storage reload.
- Trash restore/delete behavior, export output, image asset handling, image resize/crop/rotation metadata, and vault-folder move/retry/reload behavior were validated.
- The manual real-workspace pass used QA-only copied data.

Ongoing rule:

- Any newly found data-integrity bug should still get a regression test before the fix lands.

## Phase 2: Storage And Sync Hardening — Complete

Goal: make the manifest/Markdown/assets storage model resilient enough for real user data.

Completed outcomes:

- `docs/storage-schema.md` now describes the current generic vault tree, visible Markdown files, `.aislenote/` metadata, and asset layout as canonical.
- Missing Markdown files, missing/corrupt trash manifests, corrupt branch manifests, corrupt/unsupported root manifests, stale revisions, conflict folders, and paused-write safeguards are covered by storage behavior and tests.
- Settings > Data surfaces vault folder transfer, user-settings transfer, vault create/switch/move actions, vault-folder health, folder path, schema/writable state, issue details, reveal folder, and retry reload actions.
- Browser hybrid storage and Electron filesystem storage have parity coverage for the current logical app state.
- Automatic save copies have been removed in favor of explicit folder export/import and user-managed copies.
- Pre-production storage compatibility has been removed before launch.

Remaining storage follow-up:

- Keep storage health reporting focused on load-blocking issues and explicit transfer actions.

## Phase 3: Targeted Refactor — Complete For This Roadmap Gate

Goal: reduce risk in future feature work without doing a broad rewrite.

Completed outcomes:

- Vault-folder state/actions moved out of `App.tsx` into a focused controller hook.
- Storage status loading, subscription, choose/move/reveal/retry/restore actions, and related toast handling are owned by the controller.
- Hook-dependency warning cleanup was completed for the targeted editor/image-tools, navigation-history, note-body, and global-hotkey paths.
- The pass stayed behavior-preserving and avoided image-tools internals until there is a specific reason to split them.

Remaining refactor guidance:

- Treat future refactors as incremental slices attached to real feature or bug work.
- Highest-value future surfaces remain settings/frontmatter controllers and editor/image helpers.
- Do not bundle broad UI redesign into refactor-only work.

## Phase 4: UI/UX Stabilization And Input Polish — Current

Goal: clean up known workflow and editor-input rough edges before the broader visual redesign.

Completed or mostly completed first-pass areas:

- Tab-key-after-naming flow for notes and folders.
- Assignable previous/next note hotkeys, unbound by default.
- Markdown input polish for blockquotes, pasted lists, and multi-cursor list commands.
- Multi-cursor formatting support for headings, bold, italic, strikethrough, blockquotes, code blocks, list conversion, delete behavior, and Page Up/Page Down movement.
- Normal-cursor Page Up/Page Down movement in the WYSIWYG editor.

Remaining Phase 4 work:

- Continue fixing editor/workflow bugs found through real use.
- Clean up small positioning, icon, and theme issues that are clearly bugs rather than redesign work.
- Define the later design-system foundation before the full UI overhaul: spacing, typography, icon rules, control sizing, focus/disabled states, touch targets, theme tokens, and accessibility expectations.
- Custom user themes should wait until the internal token model is stable.

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
- Contextual tips for first use of folders, notes, aisles, frontmatter, and storage.
- Workflow tip for pressing Tab after naming a note or folder once that behavior exists.

Exit criteria:

- Tips are dismissible or unobtrusive.
- Tips describe implemented behavior only.
- Tips do not block expert users.

## Phase 7: Higher-Level Frontmatter Controls

Goal: expand frontmatter power after frontmatter semantics are stable.

Focus areas:

- Broaden current frontmatter workflows into higher-level batch controls.
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

- Collect or synthesize fixtures for Obsidian, OneNote, Apple Notes, Markdown folders/ZIPs, and generic HTML exports.
- Define fixture expectations for Markdown conversion, image assets, nested vaults/folders, frontmatter-like metadata, links, tags, and unsupported content.
- Add parser spikes and tests only where the export format is stable enough to evaluate.
- Document what can be imported losslessly, what needs review, and what should be left unsupported.

Exit criteria:

- Importer risk is understood before expanding beyond the first user-facing Markdown import path.
- A fixture matrix exists for the first supported importer target.
- Import work does not weaken the current local-first storage model.

## Phase 8: Desktop Deployment Prep

Goal: prepare macOS and Windows releases before full PWA/mobile release.

Focus areas:

- Choose Electron Builder or Electron Forge and document the packaging workflow.
- App identity, icons, metadata, installer strategy, Windows packaging, macOS packaging, signing/notarization, and update channels.
- Crash-safe saves and storage migration guarantees suitable for non-developer users.
- Explicit vault folder transfer and user-settings transfer flows suitable for non-developer users.
- Electron menu behavior and keyboard shortcuts on macOS and Windows.

Exit criteria:

- A clean machine can install, launch, choose storage, create notes, restart, and update without data loss.
- Vault folder and transfer behavior are understandable from inside the app.
- Release checklist passes on macOS and Windows.

## Phase 9: PWA And Mobile Deployment Prep

Goal: add PWA/mobile infrastructure after mobile editing UX is credible.

Focus areas:

- Web app manifest, service worker, install prompts, offline boot, and update behavior.
- IndexedDB durability and recovery.
- iOS Safari limitations, Android behavior, and Android-compatible desktop/PWA targets such as AluminiumOS.
- Touch ergonomics for editing, navigation, tooltip controls, and settings.
- File access limitations compared with Electron vault folders.

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

- Manual fields, template fields, computed values, derived rows, date/datetime pickers, null values, and active-note frontmatter application behave as expected.
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
