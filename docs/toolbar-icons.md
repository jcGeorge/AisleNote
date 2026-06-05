# Toolbar Icon Replacement Guide

Toolbar icons are defined in `src/components/editor/ToolbarToolIcon.tsx`.

## SVG Format

- Prefer raw SVG paths in a `0 0 24 24` viewBox.
- Keep artwork visually centered with about 2px of padding inside the viewBox.
- Use simple shapes that remain legible at a rendered 20px base size.
- Avoid embedded `<title>`, `<style>`, metadata, masks, filters, gradients, and hard-coded colors.
- Keep `frontmatter` as a text icon unless an SVG replacement is intentionally chosen.

## Color Classes

Map incoming SVG shapes to these classes:

- `toolbar-tool-icon-primary-stroke` for main strokes.
- `toolbar-tool-icon-secondary-stroke` for accent strokes.
- `toolbar-tool-icon-primary-fill` for main filled areas.
- `toolbar-tool-icon-secondary-fill` for accent filled areas.

The classes resolve through the custom theme colors `tooltip primary` and `tooltip secondary`.

## Tool IDs

Name replacement SVGs by toolbar tool id when handing them off:

```text
copy.svg
frontmatter.svg
tableOfContents.svg
aisles.svg
findReplace.svg
undo.svg
redo.svg
heading.svg
bold.svg
italic.svg
highlight.svg
strike.svg
taskList.svg
bulletList.svg
orderedList.svg
dashList.svg
blockQuote.svg
blockIndent.svg
removeBlockIndent.svg
hr.svg
link.svg
image.svg
table.svg
code.svg
codeBlock.svg
clear.svg
```

Only provided SVGs need to be swapped. Missing files should leave the current registry entry unchanged.
