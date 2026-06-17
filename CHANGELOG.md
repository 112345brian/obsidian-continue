# Changelog

## 0.2.6 — 2026-06-17

- **Plugin API**: added `api.version` and `api.getRecentPaths(limit?)` so companion plugins can read the opened-note log without accessing `openedLog` directly.
- **Version bookkeeping**: aligned `package.json` and `manifest.json` on `0.2.6`.

## 0.2.5 — 2026-06-15

### Settings

- **Obsidian 1.13+ declarative settings API**: replaced the imperative `display()` implementation with `getSettingDefinitions()` + `setControlValue()` + `this.update()`. Conditional settings (Frontmatter date field, Max lines smart ceiling) now use `visible: () => bool` predicates that re-evaluate on each update without rebuilding the DOM. The excluded folders list uses `type: 'list'` with `onDelete` and a `render:` escape hatch for the add-folder input — the FolderSuggest cleanup function is returned from the render callback so the framework tears it down cleanly on each `update()`, eliminating the keymap-scope leak that required the manual `hide()` override.
- **`minAppVersion`** bumped from `1.4.0` to `1.13.0`.

## 0.2.3 — 2026-06-14

### Fixes

- **Pending render queue**: rapid `active-leaf-change` events no longer silently drop re-renders — a `pendingRender` flag queues one follow-up render so the last state is always shown
- **CategorizeModal — accidental field deletion**: the modal now compares the textarea value against the original at save time (`originalInput`) instead of tracking a `fieldChanged` boolean; if the user clears the field and saves, that still deletes the property as intended, but reverting to the original text is now a no-op rather than a redundant frontmatter write
- **CategorizeModal — malformed wikilinks**: `normalizeWikilink` now strips stray leading `[` or trailing `]` before re-wrapping, so pasted text like `Foo]]` becomes `[[Foo]]` rather than `[[Foo]]]]`
- **Unhandled rejection in categorize**: `finally { await this.render() }` now uses `.catch(() => {})` to prevent render errors from propagating as unhandled rejections
- **Timestamp on frontmatter-sorted slots**: cards in a `frontmatter` slot now display the frontmatter date that drove their ranking rather than falling back to `mtime`
- **Duplicate exclude predicate**: extracted `isExcluded(path, exclude)` helper — the `startsWith` exclusion check was duplicated between the pool filter and orphan filter
- **Connected card borders**: each slot group's cards are now wrapped in a `.continue-note-group` container; border-radius is applied with `:first-child`/`:last-child` instead of `:has()` sibling selectors, which is more robust if sibling elements are ever injected between cards

### Settings

- **Excluded folders UI**: replaced the custom tag-chip widget with the idiomatic Obsidian pattern — one Setting row per excluded path (with a remove button) and an "Add folder" Setting at the bottom; add/remove calls `display()` to re-render

## 0.2.2 — 2026-06-14

- **Excluded folders autosuggest**: replaced the plain-text comma input with a tag-chip UI backed by `FolderSuggest` — type to get vault folder completions, select to add a chip, click × to remove
- **Fix**: `FolderSuggest` keymap scope is now properly closed in both `display()` (re-renders triggered by sortBy/smartMode toggles) and `hide()` (settings panel close), preventing suggest instances from accumulating on the app keymap
- **Fix**: `selectSuggestion` is no longer overridden in `FolderSuggest` — the concrete base-class implementation fires `onSelect` callbacks; overriding it without calling `super` silently bypassed the save/chip logic so selections were never committed
- **Fix**: all excluded-folder paths are normalized to a trailing `/` via `addExclusion()`, preventing overbroad `startsWith` matches (e.g. bare `"Notes"` accidentally excluding `"NotesArchive/"`)
- **Fix**: hidden/system folders (`.obsidian`, `.trash`, etc.) are filtered out of autosuggest results
- **Fix**: `ContinueNoteRenderer` now imports `getTrashCollectionApi` from the local `./TrashCollectionApi` mirror instead of the cross-repo path that breaks any fresh clone

## 0.2.0 — 2026-06-13

- Added `src/TrashCollectionApi.ts`: typed accessor for the Trash Collection plugin's public API — `getTrashCollectionApi(app)` returns the API object or null if the plugin isn't loaded or version-mismatches; used by the `orphan` slot type

## 0.1.0 — 2026-06-13

Initial release.

### Core block

- `continue-note` fenced code block renders a preview of your most recently accessed note
- Clickable title opens the note in the current leaf
- Relative timestamp and Breadcrumbs parent chain shown under the title (falls back to filesystem folder if Breadcrumbs isn't installed)
- Trash button (hover to reveal) sends the note to system trash and re-renders to the next candidate
- Inline markdown rendering via `MarkdownRenderer.render` — wikilinks, bold, lists, headings all render live

### Smart truncation

- Finds the last `##` section and shows the tail so you see where you left off
- Line cap scales logarithmically with note length: short notes show more, long notes show fewer
- Notes under the short-note threshold are always shown in full
- "Skipping N lines" label instead of ellipsis, so you know how much was omitted
- Fence-aware slicing: never starts a snippet inside a fenced code block

### Multi-slot support

- Show any number of notes per block, each from a different source
- Block-level slot syntax: `opened: 1`, `modified: 4`, `orphan: 2` etc.
- Sources: `modified`, `created`, `frontmatter` (any date property), `opened` (last-opened tracking, persisted across restarts), `orphan`
- Notes are deduped across slots so the same file never appears twice
- Hard cap on total notes shown (`maxTotal`, default 6)

### Trash Collection integration

- `orphan` slot type integrates with the [Trash Collection](../obsidian-trash-collection) plugin via its public `api.getCandidates()` method
- All orphan detection logic (age threshold, exclusions, conditions) comes from Trash Collection's own settings — no duplicate config
- Silently skipped if Trash Collection isn't installed

### Frontmatter display

- Optional `frontmatter:` block config key (or global setting) lists properties to show as chips under the title
- Arrays are joined with commas; missing fields are silently omitted

### Developer experience

- `.env`-based vault path: set `OBSIDIAN_CONFIG_FOLDER` and `npm run dev` auto-copies to the vault on every rebuild
- `.hotreload` file created automatically for use with the Hot Reload plugin
- `npm run build` compiles only — no copy

### Settings

| Setting | Default | Description |
|---|---|---|
| Sort by | modified | Signal used to rank notes globally |
| Frontmatter date field | date-modified | Property name when sort is `frontmatter` |
| Max notes total | 6 | Hard cap across all slots |
| Notes to show | 1 | Default count when no slots are specified |
| Excluded folders | — | Global path prefixes to ignore |
| Categorize field | up | Frontmatter property edited by the categorize button on each card |
| Frontmatter fields | — | Properties to display as chips |
| Smart mode | on | Log-scaled tail truncation |
| Max lines (smart ceiling) | 10 | Upper bound for smart cap |
| Short note threshold | 9 | Lines below which the full note is shown |
| Max lines | 6 | Fallback when smart mode is off or no `##` found |
