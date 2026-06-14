import { AbstractInputSuggest, App, TFolder } from "obsidian";

// Mirrors the TrashCollectionApi pattern — a standalone, typed wrapper around
// Obsidian's generic AbstractInputSuggest for vault folder paths.
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl);
  }

  getSuggestions(query: string): TFolder[] {
    const lower = query.toLowerCase();
    return this.app.vault
      .getAllFolders(true)
      .filter(
        (f) =>
          f.path !== "/" &&
          !f.path.startsWith(".") &&
          f.path.toLowerCase().includes(lower),
      )
      .slice(0, 20);
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }

  // selectSuggestion is intentionally NOT overridden — the concrete base-class
  // implementation fires the onSelect callbacks registered in settings.ts.
}
