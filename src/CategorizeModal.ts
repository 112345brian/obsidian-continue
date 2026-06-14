import { App, Modal, Setting, TFile } from "obsidian";

function normalizeWikilink(s: string): string {
  // Strip any stray leading [ or trailing ] before re-wrapping
  s = s.trim().replace(/^\[+/, "").replace(/\]+$/, "");
  return s ? `[[${s}]]` : s;
}

export class CategorizeModal extends Modal {
  private fieldInput: string;
  private originalInput: string;
  private folderInput = "";

  constructor(
    app: App,
    private file: TFile,
    private fieldName: string,
    private currentVal: unknown,
    // fieldVal is undefined when the user didn't touch the field (caller should skip frontmatter write)
    private onSave: (fieldVal: string | string[] | null | undefined, newFolder: string | null) => Promise<void>
  ) {
    super(app);
    this.fieldInput = Array.isArray(currentVal)
      ? currentVal.map(String).join("\n")
      : currentVal != null ? String(currentVal) : "";
    this.originalInput = this.fieldInput;
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
          let fieldVal: string | string[] | null | undefined;
          if (this.fieldInput !== this.originalInput) {
            const lines = this.fieldInput.split("\n").map(normalizeWikilink).filter(Boolean);
            fieldVal = lines.length === 0 ? null : lines.length > 1 ? lines : lines[0];
          }
          await this.onSave(fieldVal, this.folderInput.trim() || null);
        })
      )
      .addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}
