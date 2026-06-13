import { App, PluginSettingTab, Setting } from "obsidian";
import type ContinueNotePlugin from "./plugin";

export interface ContinueNoteSettings {
  count: number;
  exclude: string[];
  smartMode: boolean;
  smartAbsoluteMax: number;
  shortNoteThreshold: number;
  maxLines: number;
}

export const DEFAULT_SETTINGS: ContinueNoteSettings = {
  count: 1,
  exclude: [],
  smartMode: true,
  smartAbsoluteMax: 10,
  shortNoteThreshold: 9,
  maxLines: 6,
};

export class ContinueNoteSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: ContinueNotePlugin) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

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

    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc("Comma-separated path prefixes to ignore globally (e.g. TOC/, ARCHIVE/). Block-level exclude adds to this list.")
      .addText((text) => {
        text
          .setPlaceholder("TOC/, ARCHIVE/")
          .setValue(this.plugin.settings.exclude.join(", "))
          .onChange(async (val) => {
            this.plugin.settings.exclude = val.split(",").map((s) => s.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          });
      });

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
}
