import { Plugin } from "obsidian";
import { API_VERSION, ContinueNoteApi } from "./api";
import { parseBlockConfig } from "./parseBlockConfig";
import { ContinueNoteChild } from "./ContinueNoteRenderer";
import { ContinueNoteSettings, ContinueNoteSettingsTab, DEFAULT_SETTINGS } from "./settings";

const STYLES = `
.continue-note-block {
  border: 1px solid var(--background-modifier-border);
  border-top: none;
  border-radius: 0;
  padding: 14px 16px 12px;
  background: var(--background-secondary);
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 0;
}
.continue-note-group .continue-note-block:first-child {
  border-top: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-l) var(--radius-l) 0 0;
}
.continue-note-group .continue-note-block:last-child {
  border-radius: 0 0 var(--radius-l) var(--radius-l);
}
.continue-note-group .continue-note-block:first-child:last-child {
  border-radius: var(--radius-l);
}
.continue-note-block__header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
  position: relative;
}
.continue-note-block__actions {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.continue-note-block:hover .continue-note-block__actions {
  opacity: 1;
}
.continue-note-block__action-btn {
  color: var(--text-faint);
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: color 0.15s ease;
}
.continue-note-block__action-btn:hover {
  color: var(--text-normal);
}
.continue-note-block__action-btn--trash:hover {
  color: var(--text-error);
}
.continue-note-block__label-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.continue-note-block__label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}
.continue-note-block__title {
  font-size: 1.1em;
  font-weight: 700;
  color: var(--text-normal);
  cursor: pointer;
  line-height: 1.3;
  margin: 0;
}
.continue-note-block__title:hover {
  color: var(--text-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.continue-note-block__meta {
  font-size: 0.78em;
  color: var(--text-faint);
}
.continue-note-block__meta-sep {
  margin: 0 4px;
}
.continue-note-block__fm {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.continue-note-block__fm-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75em;
  background: var(--background-modifier-hover);
  border-radius: var(--radius-s);
  padding: 1px 6px;
}
.continue-note-block__fm-key {
  color: var(--text-faint);
}
.continue-note-block__fm-val {
  color: var(--text-muted);
}
.continue-note-block__divider {
  border: none;
  border-top: 1px solid var(--background-modifier-border);
  margin: 0 0 10px 0;
}
.continue-note-block__preview {
  overflow: hidden;
}
.continue-note-block__preview > *:first-child { margin-top: 0 !important; }
.continue-note-block__preview > *:last-child { margin-bottom: 0 !important; }
.continue-note-block__preview p,
.continue-note-block__preview li,
.continue-note-block__preview span {
  font-size: 0.83em;
  color: var(--text-muted);
  line-height: 1.6;
}
.continue-note-block__preview h1,
.continue-note-block__preview h2,
.continue-note-block__preview h3,
.continue-note-block__preview h4,
.continue-note-block__preview h5,
.continue-note-block__preview h6 {
  font-size: 0.83em !important;
  color: var(--text-muted) !important;
  font-weight: 600;
  margin: 4px 0 2px !important;
  border: none !important;
  padding: 0 !important;
}
.continue-note-block__preview ul,
.continue-note-block__preview ol {
  padding-left: 1.2em;
  margin: 2px 0;
}
.continue-note-block__open {
  display: block;
  margin-top: 10px;
  font-size: 0.78em;
  font-weight: 600;
  color: var(--text-accent);
  cursor: pointer;
  letter-spacing: 0.02em;
}
.continue-note-block__open:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.continue-note-block__skip {
  font-size: 0.75em;
  color: var(--text-faint);
  font-style: italic;
  margin: 4px 0;
}
.continue-note-block__empty {
  color: var(--text-muted);
  font-style: italic;
  font-size: 0.85em;
}
.continue-note-block__section {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.68em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-faint);
  margin: 10px 0 4px;
}
.continue-note-block__section:first-child {
  margin-top: 0;
}
.continue-note-block__section::before,
.continue-note-block__section::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--background-modifier-border);
}
`;

const OPENED_LOG_MAX = 500;

export default class ContinueNotePlugin extends Plugin {
  api: ContinueNoteApi;
  settings: ContinueNoteSettings;
  openedLog: string[] = []; // most-recently-opened paths, newest first

  async onload() {
    await this.loadSettings();
    this.api = {
      version: API_VERSION,
      getRecentPaths: (limit?: number) => this.getRecentPaths(limit),
    };

    const styleEl = document.createElement("style");
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
    this.register(() => styleEl.remove());

    this.addSettingTab(new ContinueNoteSettingsTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (!file) return;
        this.openedLog = [
          file.path,
          ...this.openedLog.filter((p) => p !== file.path),
        ].slice(0, OPENED_LOG_MAX);
        this.saveSettings();
      })
    );

    this.registerMarkdownCodeBlockProcessor(
      "continue-note",
      (source, el, ctx) => {
        const config = parseBlockConfig(source);
        ctx.addChild(new ContinueNoteChild(this.app, config, this.settings, () => this.openedLog, el, ctx));
      }
    );
  }

  async loadSettings() {
    const data = await this.loadData() ?? {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings ?? data);
    this.openedLog = Array.isArray(data.openedLog) ? data.openedLog : [];
  }

  async saveSettings() {
    await this.saveData({ settings: this.settings, openedLog: this.openedLog });
  }

  getRecentPaths(limit?: number): string[] {
    const paths = [...this.openedLog];
    return typeof limit === "number" ? paths.slice(0, limit) : paths;
  }
}
