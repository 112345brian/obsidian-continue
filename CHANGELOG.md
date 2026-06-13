# Changelog

## 0.1.0 — 2026-06-13

Initial release.

- `continue-note` fenced code block that previews the most recently modified note
- Smart truncation: finds the last `##` section and shows a log-scaled tail so longer notes get fewer lines
- Short-note threshold: notes under N lines are always shown in full
- Inline markdown rendering via `MarkdownRenderer.render`
- Breadcrumbs integration: shows the BC parent chain above the note path when the Breadcrumbs plugin is active
- Trash button: hover to reveal, click to send the note to the system trash and re-render
- Clickable title: opens the note in the current leaf
- Per-block config options: `count` (how many notes to show) and `exclude` (path prefixes to skip)
- Settings tab: global `count`, smart mode toggle, smart ceiling, short-note threshold, max lines (non-smart fallback)
- CSS injected at load time so it works regardless of theme
