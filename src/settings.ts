import { App, normalizePath, PluginSettingTab, Setting } from "obsidian";
import type ContinueNotePlugin from "./plugin";
import { FolderSuggest } from "./FolderSuggest";

export type SortBy = "modified" | "created" | "frontmatter" | "opened" | "orphan";

export interface ContinueNoteSettings {
  count: number;
  maxTotal: number;
  exclude: string[];
  frontmatterFields: string[];
  sortBy: SortBy;
  sortFrontmatterField: string;
  smartMode: boolean;
  smartAbsoluteMax: number;
  shortNoteThreshold: number;
  maxLines: number;
  categorizeField: string;
}

export const DEFAULT_SETTINGS: ContinueNoteSettings = {
  count: 1,
  maxTotal: 6,
  exclude: [],
  frontmatterFields: [],
  sortBy: "modified",
  sortFrontmatterField: "date-modified",
  smartMode: true,
  smartAbsoluteMax: 10,
  shortNoteThreshold: 9,
  maxLines: 6,
  categorizeField: "up",
};

export class ContinueNoteSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: ContinueNotePlugin) {
    super(app, plugin);
  }

  getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    // Trim text fields; restore the default when the field is cleared entirely
    if (typeof value === "string") {
      value = value.trim() || (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key];
    }
    (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
    await this.plugin.saveSettings();
    // Re-evaluates visible predicates and refreshes desc strings that depend on settings state
    this.update();
  }

  getSettingDefinitions() {
    const s = this.plugin.settings;

    return [
      // ── Sorting ───────────────────────────────────────────────────────────
      {
        name: "Sort by",
        desc: "What signal determines which note is most recent.",
        control: {
          type: "dropdown" as const,
          key: "sortBy",
          options: {
            modified:    "Last modified (file system)",
            created:     "Last created (file system)",
            frontmatter: "Frontmatter field",
            opened:      "Last opened in Obsidian",
            orphan:      "Orphan notes (via Trash Collection plugin)",
          } as Record<SortBy, string>,
        },
      },
      {
        name: "Frontmatter date field",
        desc: "The property name to sort by (must contain a parseable date).",
        visible: (): boolean => s.sortBy === "frontmatter",
        control: {
          type: "text" as const,
          key: "sortFrontmatterField",
          placeholder: "date-modified",
        },
      },
      // ── Counts ────────────────────────────────────────────────────────────
      {
        name: "Max notes total",
        desc: "Hard cap on how many notes the block can show, regardless of slot config.",
        control: { type: "number" as const, key: "maxTotal", min: 1 },
      },
      {
        name: "Notes to show",
        desc: "How many recent notes to show by default. Can be overridden per-block with count: N.",
        control: { type: "number" as const, key: "count", min: 1 },
      },
      // ── Excluded paths ────────────────────────────────────────────────────
      {
        name: "Excluded paths",
        desc: "Files or folder prefixes to ignore globally. Type a file path (e.g. TOC/Recents.md) or folder prefix (e.g. Templates/). Block-level exclude adds to this list.",
      },
      {
        type: "list" as const,
        emptyState: "Nothing excluded.",
        items: s.exclude.map(path => ({ name: path })),
        onDelete: (index: number) => {
          this.plugin.settings.exclude = this.plugin.settings.exclude.filter((_, i) => i !== index);
          this.update();
          void this.plugin.saveSettings();
        },
      },
      {
        name: "Add excluded path",
        render: (setting: Setting): (() => void) | void => {
          let suggest: FolderSuggest | null = null;
          setting.addText(t => {
            t.setPlaceholder("Folder/ or Note.md…");
            suggest = new FolderSuggest(this.app, t.inputEl);
            const addFolder = async (raw: string) => {
              if (!raw) return;
              const base = normalizePath(raw.endsWith("/") ? raw.slice(0, -1) : raw);
              const normalized = base + "/";
              if (this.plugin.settings.exclude.includes(normalized)) return;
              this.plugin.settings.exclude = [...this.plugin.settings.exclude, normalized];
              await this.plugin.saveSettings();
              this.update();
            };
            suggest.onSelect(async folder => addFolder(folder.path));
            t.inputEl.addEventListener("keydown", async (e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              await addFolder(t.getValue().trim());
            });
          });
          // Called by the framework before tearing down the row on each update()
          return () => suggest?.close();
        },
      },
      // ── Display ───────────────────────────────────────────────────────────
      {
        name: "Categorize field",
        desc: "Frontmatter property edited by the categorize (chevron) button on each card.",
        control: { type: "text" as const, key: "categorizeField", placeholder: "up" },
      },
      {
        name: "Frontmatter fields",
        desc: "Comma-separated properties to show as chips under the title (e.g. status, tags). Leave empty to show none.",
        render: (setting: Setting): void => {
          setting.addText(t =>
            t.setPlaceholder("status, tags")
              .setValue(s.frontmatterFields.join(", "))
              .onChange(async (val) => {
                this.plugin.settings.frontmatterFields = val.split(",").map(v => v.trim()).filter(Boolean);
                await this.plugin.saveSettings();
              })
          );
        },
      },
      // ── Smart truncation ──────────────────────────────────────────────────
      {
        name: "Smart mode",
        desc: "Shows the tail of the last ## section so you see where you left off. Falls back to max lines if there's no heading.",
        control: { type: "toggle" as const, key: "smartMode" },
      },
      {
        name: "Max lines (smart ceiling)",
        desc: "Upper bound for the adaptive cap. Shorter notes get closer to this; longer notes get fewer lines shown.",
        visible: (): boolean => s.smartMode,
        control: { type: "number" as const, key: "smartAbsoluteMax", min: 1 },
      },
      {
        name: "Short note threshold",
        desc: "Notes with this many lines or fewer are always shown in full.",
        control: { type: "number" as const, key: "shortNoteThreshold", min: 1 },
      },
      {
        name: "Max lines",
        desc: s.smartMode ? "Fallback when no ## heading is found." : "Maximum lines to preview.",
        control: { type: "number" as const, key: "maxLines", min: 1 },
      },
    ];
  }
}
