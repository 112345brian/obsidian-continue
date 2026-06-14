import { App, Modal, Setting, TFile } from "obsidian";

function normalizeWikilink(s: string): string {
  s = s.trim();
  if (!s || s.startsWith("[[")) return s;
  return `[[${s}]]`;
}

export class CategorizeModal extends Modal {
  private fieldInput = "";
  private folderInput = "";
  private wasArray: boolean;

  constructor(
    app: App,
    private file: TFile,
    private fieldName: string,
    private currentVal: unknown,
    private onSave: (fieldVal: string | string[] | null, newFolder: string | null) => Promise<void>
  ) {
    super(app);
    this.wasArray = Array.isArray(currentVal);
    this.fieldInput = Array.isArray(currentVal)
      ? currentVal.map(String).join("\n")
      : currentVal != null ? String(currentVal) : "";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.file.basename, cls: "cn-cat-title" });

    new Setting(contentEl)
      .setName(this.fieldName)
      .setDesc("Use [[Note Name]] syntax. Separate multiple values with newlines.")
      .addTextArea((ta) => {
        ta.setValue(this.fieldInput).onChange((v) => { this.fieldInput = v; });
        ta.inputEl.rows = 3;
        ta.inputEl.style.cssText = "width:100%;font-family:var(--font-monospace)";
      });

    new Setting(contentEl)
      .setName("Move to folder")
      .setDesc("Leave blank to keep current location.")
      .addText((t) => {
        t.setPlaceholder(this.file.parent?.path ?? "/").onChange((v) => { this.folderInput = v; });
        t.inputEl.style.width = "100%";
      });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Save").setCta().onClick(async () => {
          this.close();
          const lines = this.fieldInput.split("\n").map(normalizeWikilink).filter(Boolean);
          const fieldVal: string | string[] | null =
            lines.length === 0 ? null
            : this.wasArray || lines.length > 1 ? lines
            : lines[0];
          await this.onSave(fieldVal, this.folderInput.trim() || null);
        })
      )
      .addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}
