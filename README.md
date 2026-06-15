# Continue Note

An Obsidian plugin that embeds a live preview of your most recently accessed notes directly in any note — so you always know where you left off.

## What it does

Place a `continue-note` code block anywhere in a note. It renders one or more cards, each showing the title, timestamp, location, and a smart excerpt of a recent note. Click the title to open it. Hover to reveal action buttons (categorize, trash).

```
```continue-note
opened: 1
modified: 3
orphan: 2
```
```

Each line is a **slot**: a source type and a count. You can mix and match any combination.

## Slot types

| Slot | Description |
|---|---|
| `modified` | Most recently modified notes (by filesystem mtime) |
| `created` | Most recently created notes (by filesystem ctime) |
| `opened` | Most recently opened in Obsidian (tracked across restarts) |
| `frontmatter` | Sorted by a frontmatter date property (see settings) |
| `orphan` | Unlinked notes surfaced by the [Trash Collection](https://github.com/112345brian/obsidian-trash-collection) plugin |

Notes are deduped across slots — the same file never appears twice. A hard cap (`maxTotal`, default 6) limits total cards regardless of slot config.

If no slots are specified, the block uses the global "Sort by" and "Notes to show" settings.

## Content preview

The plugin shows the tail of the last `##` section so you see exactly where you left off. The line count scales with note length (short notes show more, long notes fewer). Notes under the short-note threshold are shown in full. A "skipping N lines" label appears when content is omitted — no silent ellipsis.

## Action buttons (hover to reveal)

- **Categorize** (`link-2` icon): opens a modal to edit a frontmatter field (default: `up`) and optionally move the note to a different folder. Useful for filing unlinked notes into your hierarchy.
- **Trash** (`trash` icon): sends the note to system trash and re-renders the block immediately.

## Settings

| Setting | Default | Description |
|---|---|---|
| Sort by | `modified` | Default signal for notes-to-show when no slots are configured |
| Frontmatter date field | `date-modified` | Property name when sort is `frontmatter` |
| Max notes total | `6` | Hard cap across all slots |
| Notes to show | `1` | Default count when no slot config is in the block |
| Excluded folders | — | Global path prefixes to ignore (e.g. `Templates/`) |
| Categorize field | `up` | Frontmatter property edited by the categorize button |
| Frontmatter fields | — | Properties to display as chips under the title (e.g. `status, tags`) |
| Smart mode | on | Log-scaled tail truncation based on last `##` section |
| Max lines (smart ceiling) | `10` | Upper bound for the adaptive cap |
| Short note threshold | `9` | Notes with this many lines or fewer are always shown in full |
| Max lines | `6` | Fallback when smart mode is off or no `##` heading is found |

Block-level config can override global settings. `exclude: Templates/` inside the block adds to the global exclusion list for that block only.

## Optional integrations

- **[Breadcrumbs](https://github.com/SkepticMystic/breadcrumbs)**: if installed, the parent chain from the `up` hierarchy is shown under the title instead of the filesystem folder.
- **[Trash Collection](https://github.com/112345brian/obsidian-trash-collection)**: required for the `orphan` slot type. All detection logic (age, conditions, exclusions) comes from Trash Collection's own settings — no duplicate config needed here.

## Requirements

- Obsidian 1.13.0 or later
