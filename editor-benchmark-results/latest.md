# Replacement Editor Benchmark

Generated: 2026-06-12T20:31:16.317Z
Fixture: small Markdown table with external lucide.dev links

## Raw Numbers

| Candidate | OK | Mount ms | Rendered table/links | Focus out ms | Type out p50/p95/max | Focus in ms | Type in p50/p95/max | Serialize ms | Destroy ms | Remount ms | Switch p50/p95/max | Long tasks | Round trip |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Toast UI Editor baseline | yes | 25.2 | 2/50 | 1.4 | 15.1/17.9/19.3 | 1.7 | 14.8/19.7/21.1 | 1.9 | 2 | 13.7 | 1.1/4.2/4.2 | 0 / 0ms | pass |
| CodeMirror 6 Markdown | yes | 8.9 | 0/0 | 7.8 | 11.5/26.5/27.4 | 1.2 | 13.7/27.2/27.5 | 0.6 | 1.2 | 2.1 | 0.8/4.1/4.1 | 0 / 0ms | pass |
| MDXEditor minimal WYSIWYG | yes | 81.6 | 1/25 | 1.3 | 13.4/26.3/26.4 | 24.9 | 12.5/26.4/26.7 | 0.6 | 4.5 | 52.5 | 18/21.1/21.1 | 1 / 67ms | pass |
| Lexical direct minimal rich editor | yes | 11.4 | 0/25 | 0.7 | 13.6/26.3/26.4 | 0.6 | 14.6/27.1/28.6 | 1.3 | 0.9 | 7.9 | 0.4/0.8/0.8 | 0 / 0ms | fail |
| Tiptap minimal Markdown | yes | 17.1 | 1/25 | 2.1 | 12.8/26.4/26.8 | 0.4 | 13.2/26.4/28.2 | 2.3 | 0.9 | 13.1 | 0.6/1.1/1.1 | 0 / 0ms | pass |

## Candidates Tested

### Toast UI Editor baseline

- ID: `toast-ui`
- Kind: wysiwyg-markdown
- Status: completed
- Rendered shape: 2 table element(s), 50 link element(s).
- Markdown round trip: pass; Fixture heading, table shape, and sampled external links survived.
- Feature gaps: Baseline uses Toast UI WYSIWYG and app display prep/blank restore, without app media/note-preview plugins.
- Migration risk: Low if retained, but current app diagnostics already show constructor/change/blank-restore costs.

### CodeMirror 6 Markdown

- ID: `codemirror-6`
- Kind: source-markdown
- Status: completed
- Rendered shape: 0 table element(s), 0 link element(s).
- Markdown round trip: pass; Fixture heading, table shape, and sampled external links survived.
- Feature gaps: Source Markdown editor, not WYSIWYG. Would need a separate preview or rich editing layer to match current notes UX.
- Migration risk: Medium: fastest likely core, but it changes the editing model away from WYSIWYG.

### MDXEditor minimal WYSIWYG

- ID: `mdxeditor`
- Kind: wysiwyg-markdown
- Status: completed
- Rendered shape: 1 table element(s), 25 link element(s).
- Markdown round trip: pass; Fixture heading, table shape, and sampled external links survived.
- Feature gaps: Toolbar, app-specific commands, and custom note/media behavior are not included in this spike. MDX support is unused here; this is testing its Markdown WYSIWYG core.
- Migration risk: Medium: React/Lexical foundation with Markdown input/output, but toolbar and custom behaviors need replacement.

### Lexical direct minimal rich editor

- ID: `lexical-direct`
- Kind: wysiwyg-markdown
- Status: completed
- Rendered shape: 0 table element(s), 25 link element(s).
- Markdown round trip: fail; Rendered editor did not expose a table element, so the table was not actually WYSIWYG in this harness.
- Feature gaps: Direct Lexical needs custom Markdown table transformers for a production-quality Markdown table round trip. Toolbar, commands, paste handling, and app-specific note/media behavior would be custom migration work.
- Migration risk: High: strong editor foundation, but direct migration requires owning Markdown table behavior and more editor plumbing.

### Tiptap minimal Markdown

- ID: `tiptap`
- Kind: wysiwyg-markdown
- Status: completed
- Rendered shape: 1 table element(s), 25 link element(s).
- Markdown round trip: pass; Fixture heading, table shape, and sampled external links survived.
- Feature gaps: Markdown support is tested through Tiptap markdown extension rather than the app storage pipeline. Tiptap keeps the app on a ProseMirror-derived editor stack.
- Migration risk: Medium-high: familiar ProseMirror concepts, but Markdown layer and custom toolbar behavior need validation.


## Recommendation

Keep Toast UI only if the production-only plugins/blank-restore path are proven to be the actual issue; the isolated baseline met the spike thresholds.

