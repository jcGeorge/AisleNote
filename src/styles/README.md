# Style Tokens

`base.css` is the default token registry. Theme files override token values; component styles should consume semantic tokens instead of hard-coded colors, shadows, and borders.

## Naming

- Use app tokens for app-wide surfaces: `--app-*`, `--modal-*`, `--context-menu-*`, `--toast-*`, navigation tokens, settings tokens, and trash tokens.
- Use editor tokens for editor chrome and content: `--editor-*`.
- Use feature tokens for editor-only affordances that need several related values: `--task-reorder-*`, `--image-tool-*`, and `--link-prompt-*`.
- New component CSS should prefer an existing semantic token before adding a new one.

## Themes

- Default values live in `base.css`.
- `themes/light.css` and `themes/cheese.css` should override the semantic token values, not repeat hard-coded values inside selector rules.
- Keep `--monet-editor-*` as compatibility aliases only. New CSS should use `--editor-*`.

## Hard-Coded Values

Hard-coded CSS values are acceptable for:

- Layout geometry, spacing, sizing, z-indexes, transforms, and radii.
- Transparent, `currentColor`, and inherited values.
- Icon sprite positions, encoded SVG data URLs, and one-off drawing internals that cannot consume CSS variables cleanly.
- Temporary values in a new component only while promoting them into tokens in the same pass.

If a value controls color, border color, background, or shadow for a reusable UI state, add or reuse a semantic token instead.
