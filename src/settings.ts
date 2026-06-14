import { App, PluginSettingTab, Setting, normalizePath } from "obsidian";
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
  private folderSuggest: FolderSuggest | null = null;

  constructor(app: App, private plugin: ContinueNotePlugin) {
    super(app, plugin);
  }

  hide() {
    this.folderSuggest?.close();
    this.folderSuggest = null;
  }

  display() {
    // Close the previous FolderSuggest before wiping the DOM so its keymap
    // scope is removed and its input listeners are detached cleanly.
    this.folderSuggest?.close();
    this.folderSuggest = null;

    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Sort by")
      .setDesc("What signal determines which note is most recent.")
      .addDropdown((d) =>
        d
          .addOption("modified", "Last modified (file system)")
          .addOption("created", "Last created (file system)")
          .addOption("frontmatter", "Frontmatter field")
          .addOption("opened", "Last opened in Obsidian")
          .addOption("orphan", "Orphan notes (via Trash Collection plugin)")
          .setValue(this.plugin.settings.sortBy)
          .onChange(async (val) => {
            this.plugin.settings.sortBy = val as SortBy;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.sortBy === "frontmatter") {
      new Setting(containerEl)
        .setName("Frontmatter date field")
        .setDesc("The property name to sort by (must contain a parseable date).")
        .addText((t) =>
          t
            .setPlaceholder("date-modified")
            .setValue(this.plugin.settings.sortFrontmatterField)
            .onChange(async (val) => {
              this.plugin.settings.sortFrontmatterField = val.trim();
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl)
      .setName("Max notes total")
      .setDesc("Hard cap on how many notes the block can show, regardless of slot config.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.maxTotal))
          .onChange(async (val) => {
            const n = parseInt(val, 10);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.maxTotal = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Notes to show")
      .setDesc("How many recent notes to show in the block by default. Can be overridden per-block with count: N.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.count))
          .onChange(async (val) => {
            const n = parseInt(val, 10);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.count = n;
              await this.plugin.saveSettings();
            }
          })
      );

    this.renderExcludeFolders(containerEl);

    new Setting(containerEl)
      .setName("Categorize field")
      .setDesc("Frontmatter property edited by the categorize (chevron) button on each card.")
      .addText((t) =>
        t
          .setPlaceholder("up")
          .setValue(this.plugin.settings.categorizeField)
          .onChange(async (val) => {
            this.plugin.settings.categorizeField = val.trim() || "up";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Frontmatter fields")
      .setDesc("Comma-separated frontmatter properties to show under the title (e.g. status, tags). Leave empty to show none.")
      .addText((text) =>
        text
          .setPlaceholder("status, tags")
          .setValue(this.plugin.settings.frontmatterFields.join(", "))
          .onChange(async (val) => {
            this.plugin.settings.frontmatterFields = val.split(",").map((s) => s.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Smart mode")
      .setDesc("Shows the tail of the last ## section so you see where you left off. Falls back to max lines if there's no heading.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.smartMode).onChange(async (val) => {
          this.plugin.settings.smartMode = val;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    if (this.plugin.settings.smartMode) {
      new Setting(containerEl)
        .setName("Max lines (smart ceiling)")
        .setDesc("Upper bound for the adaptive cap. Shorter notes get closer to this; longer notes get fewer lines shown.")
        .addText((text) =>
          text
            .setValue(String(this.plugin.settings.smartAbsoluteMax))
            .onChange(async (val) => {
              const n = parseInt(val, 10);
              if (!isNaN(n) && n > 0) {
                this.plugin.settings.smartAbsoluteMax = n;
                await this.plugin.saveSettings();
              }
            })
        );
    }

    new Setting(containerEl)
      .setName("Short note threshold")
      .setDesc("Notes with this many lines or fewer are always shown in full.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.shortNoteThreshold))
          .onChange(async (val) => {
            const n = parseInt(val, 10);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.shortNoteThreshold = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Max lines")
      .setDesc(
        this.plugin.settings.smartMode
          ? "Fallback when no ## heading is found."
          : "Maximum lines to preview."
      )
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.maxLines))
          .onChange(async (val) => {
            const n = parseInt(val, 10);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.maxLines = n;
              await this.plugin.saveSettings();
            }
          })
      );
  }

  private async addExclusion(rawPath: string, renderList: () => void): Promise<void> {
    if (!rawPath) return;
    // normalizePath handles backslashes, double slashes, etc. from manual keyboard entry
    const base = normalizePath(rawPath.endsWith("/") ? rawPath.slice(0, -1) : rawPath);
    const normalized = base + "/";
    if (this.plugin.settings.exclude.includes(normalized)) return;
    this.plugin.settings.exclude = [...this.plugin.settings.exclude, normalized];
    await this.plugin.saveSettings();
    renderList();
  }

  private renderExcludeFolders(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc("Path prefixes to ignore globally. Block-level exclude adds to this list.")
      .setHeading();

    // Isolated container so add/remove only re-renders the folder rows,
    // not the entire settings tab (which would wipe unsaved sibling fields).
    const listEl = containerEl.createDiv();

    const renderList = () => {
      listEl.empty();
      for (const path of this.plugin.settings.exclude) {
        new Setting(listEl)
          .setName(path)
          .addButton((btn) =>
            btn.setIcon("x").setTooltip("Remove").onClick(async () => {
              this.plugin.settings.exclude = this.plugin.settings.exclude.filter((p) => p !== path);
              await this.plugin.saveSettings();
              renderList();
            })
          );
      }
    };
    renderList();

    new Setting(containerEl).setName("Add folder").addText((t) => {
      t.setPlaceholder("Folder path…");
      this.folderSuggest = new FolderSuggest(this.app, t.inputEl);
      this.folderSuggest.onSelect(async (folder) => {
        await this.addExclusion(folder.path, renderList);
      });
      t.inputEl.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          await this.addExclusion(t.getValue().trim(), renderList);
        }
      });
    });
  }
}
