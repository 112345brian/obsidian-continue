import { App, MarkdownRenderChild, MarkdownRenderer, Notice, TFile, normalizePath, setIcon } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import { BlockConfig, Slot } from "./parseBlockConfig";
import { getTrashCollectionApi } from "./TrashCollectionApi";
import { CategorizeModal } from "./CategorizeModal";
import type { ContinueNoteSettings, SortBy } from "./settings";

export interface CachedCard {
  path: string;
  basename: string;
  timeVal: number;
  location: string | null;
  fmFields: Array<{ key: string; val: string }>;
  chunks: Array<{ md: string; skippedBefore: number }>;
}

export interface CachedGroup {
  label: string;
  cards: CachedCard[];
}

interface BCGraph {
  get_outgoing_edges(path: string): { to_array(): Array<{ edge_type?: string; target?: string; target_path?: (g: BCGraph) => string }> };
  get_incoming_edges(path: string): { to_array(): Array<{ edge_type?: string; source?: string; source_path?: (g: BCGraph) => string }> };
}

function getBCGraph(app: App): BCGraph | null {
  const plugins = (app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins;
  const bc = plugins?.plugins?.["breadcrumbs"] as { graph?: BCGraph } | undefined;
  const graph = bc?.graph;
  if (!graph || typeof graph.get_outgoing_edges !== "function") return null;
  return graph;
}

function getBCParentChain(graph: BCGraph, path: string, app: App): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();
  let current = path;
  while (true) {
    if (visited.has(current)) break;
    visited.add(current);
    let parent: string | undefined;
    for (const e of graph.get_outgoing_edges(current).to_array()) {
      if (e.edge_type?.toLowerCase() !== "up") continue;
      parent = e.target_path?.(graph) ?? e.target;
      break;
    }
    if (!parent) {
      for (const e of graph.get_incoming_edges(current).to_array()) {
        if (e.edge_type?.toLowerCase() !== "down") continue;
        parent = e.source_path?.(graph) ?? e.source;
        break;
      }
    }
    if (!parent) break;
    const file = app.vault.getAbstractFileByPath(parent);
    if (file instanceof TFile) chain.unshift(file.basename);
    current = parent;
  }
  return chain;
}

const FRONTMATTER_RE = /^---[\s\S]*?---\s*\n?/;

function buildFenceMap(lines: string[]): boolean[] {
  const map: boolean[] = new Array(lines.length).fill(false);
  let openFence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(`{3,}|~{3,})/);
    if (m) {
      if (!openFence) {
        openFence = m[1];
        map[i] = true;
      } else if (lines[i].startsWith(openFence)) {
        map[i] = true;
        openFence = null;
      } else {
        map[i] = true;
      }
    } else if (openFence) {
      map[i] = true;
    }
  }
  return map;
}

function closeOpenFences(md: string): string {
  const lines = md.split("\n");
  let open: string | null = null;
  for (const line of lines) {
    const m = line.match(/^(`{3,}|~{3,})/);
    if (m) {
      if (!open) open = m[1];
      else if (line.startsWith(open)) open = null;
    }
  }
  return open ? md + "\n" + open : md;
}

const SLOT_LABEL: Record<string, string> = {
  opened:      "opened",
  modified:    "modified",
  created:     "created",
  frontmatter: "by date",
  orphan:      "unlinked",
};

function relativeTime(mtime: number): string {
  const diff = Date.now() - mtime;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

export class ContinueNoteChild extends MarkdownRenderChild {
  private rendering = false;
  private pendingRender = false;

  constructor(
    private app: App,
    private config: BlockConfig,
    private settings: ContinueNoteSettings,
    private getOpenedLog: () => string[],
    private getCache: (key: string) => CachedGroup[] | undefined,
    private setCache: (key: string, groups: CachedGroup[]) => Promise<void>,
    el: HTMLElement,
    private ctx: MarkdownPostProcessorContext
  ) {
    super(el);
  }

  async onload() {
    const cached = this.getCache(this.ctx.sourcePath);
    if (cached) {
      await this._renderFromCache(cached);
    }
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", async () => {
        const active = this.app.workspace.getActiveFile();
        if (active?.path === this.ctx.sourcePath) await this.render();
      })
    );
    void this.render();
  }

  async render() {
    if (this.rendering) {
      this.pendingRender = true;
      return;
    }
    this.rendering = true;
    try {
      await this._render();
    } finally {
      this.rendering = false;
      if (this.pendingRender) {
        this.pendingRender = false;
        void this.render();
      }
    }
  }

  private isExcluded(path: string, exclude: string[]): boolean {
    return exclude.some((p) => path.startsWith(p) || path === p.slice(0, -1));
  }

  private async _render() {
    this.containerEl.empty();

    const exclude = [...this.settings.exclude, ...this.config.exclude];
    const { sortFrontmatterField } = this.settings;

    const scoreFor = (sortBy: SortBy): (f: TFile) => number => {
      if (sortBy === "opened") {
        const log = this.getOpenedLog();
        const rankMap = new Map(log.map((p, i) => [p, log.length - i]));
        return (f) => rankMap.get(f.path) ?? 0;
      }
      if (sortBy === "created") return (f) => f.stat.ctime;
      if (sortBy === "frontmatter") {
        return (f) => {
          const val = this.app.metadataCache.getFileCache(f)?.frontmatter?.[sortFrontmatterField];
          if (val) { const t = Date.parse(String(val)); if (!isNaN(t)) return t; }
          return 0;
        };
      }
      return (f) => f.stat.mtime;
    };

    const pool = this.app.vault.getMarkdownFiles().filter((f) => {
      if (f.path === this.ctx.sourcePath) return false;
      return !this.isExcluded(f.path, exclude);
    });

    const slots: Slot[] = this.config.slots ?? [
      { sortBy: this.settings.sortBy, count: this.settings.count },
    ];

    const trashApi = getTrashCollectionApi(this.app);

    const seen = new Set<string>();
    const groups: Array<{ label: string; files: TFile[]; slotSortBy: SortBy }> = [];
    let remaining = this.settings.maxTotal;

    for (const slot of slots) {
      if (remaining <= 0) break;
      const slotMax = Math.min(slot.count, remaining);
      const files: TFile[] = [];

      if (slot.sortBy === "orphan") {
        if (!trashApi) continue;
        const orphans = trashApi.getCandidates()
          .filter((f) => f.path !== this.ctx.sourcePath && !seen.has(f.path) && !this.isExcluded(f.path, exclude));
        for (const f of orphans.slice(0, slotMax)) {
          seen.add(f.path);
          files.push(f);
        }
      } else {
        const scorer = scoreFor(slot.sortBy);
        const sorted = [...pool].sort((a, b) => scorer(b) - scorer(a));
        for (const f of sorted) {
          if (seen.has(f.path)) continue;
          seen.add(f.path);
          files.push(f);
          if (files.length >= slotMax) break;
        }
      }

      if (files.length > 0) {
        remaining -= files.length;
        groups.push({ label: SLOT_LABEL[slot.sortBy], files, slotSortBy: slot.sortBy });
      }
    }

    if (groups.length === 0) {
      const groupEl = this.containerEl.createDiv({ cls: "continue-note-group" });
      const wrapper = groupEl.createDiv({ cls: "continue-note-block" });
      wrapper.createDiv({ cls: "continue-note-block__empty", text: "No notes found." });
      await this.setCache(this.ctx.sourcePath, []);
      return;
    }

    const cachedGroups: CachedGroup[] = [];
    const showLabels = groups.length > 1;
    for (const group of groups) {
      if (showLabels) {
        this.containerEl.createDiv({ cls: "continue-note-block__section", text: group.label });
      }
      const groupEl = this.containerEl.createDiv({ cls: "continue-note-group" });
      const fmScorer = group.slotSortBy === "frontmatter" ? scoreFor("frontmatter") : null;
      const cachedCards: CachedCard[] = [];
      for (const f of group.files) {
        const timeVal = group.slotSortBy === "created"
          ? f.stat.ctime
          : fmScorer
            ? (fmScorer(f) || f.stat.mtime)
            : f.stat.mtime;
        const card = await this.renderCard(f, timeVal, groupEl);
        cachedCards.push(card);
      }
      cachedGroups.push({ label: group.label, cards: cachedCards });
    }

    await this.setCache(this.ctx.sourcePath, cachedGroups);
  }

  private async _renderFromCache(groups: CachedGroup[]) {
    this.containerEl.empty();
    if (groups.length === 0) return;

    const showLabels = groups.length > 1;
    for (const group of groups) {
      if (showLabels) {
        this.containerEl.createDiv({ cls: "continue-note-block__section", text: group.label });
      }
      const groupEl = this.containerEl.createDiv({ cls: "continue-note-group" });
      for (const card of group.cards) {
        await this.renderCardFromData(card, groupEl);
      }
    }
  }

  private async renderCard(target: TFile, timeVal: number, groupEl: HTMLElement): Promise<CachedCard> {
    const graph = getBCGraph(this.app);
    const chain = graph ? getBCParentChain(graph, target.path, this.app) : [];
    const location = chain.length > 0
      ? chain.join(" › ")
      : (target.parent?.name && target.parent.name !== "/" ? target.parent.name : null);

    const fields = this.config.frontmatterFields ?? this.settings.frontmatterFields;
    const fmFields: Array<{ key: string; val: string }> = [];
    if (fields.length > 0) {
      const fm = this.app.metadataCache.getFileCache(target)?.frontmatter ?? {};
      for (const key of fields) {
        const val = fm[key];
        if (val == null) continue;
        fmFields.push({ key, val: Array.isArray(val) ? val.join(", ") : String(val) });
      }
    }

    const raw = await this.app.vault.read(target);
    const body = raw.replace(FRONTMATTER_RE, "").trimStart();
    const lines = body.split("\n");
    const fenceMap = buildFenceMap(lines);

    const safeTailStart = (from: number) => {
      let i = from;
      while (i < lines.length && fenceMap[i]) i++;
      return i;
    };

    const { smartMode, smartAbsoluteMax, shortNoteThreshold, maxLines } = this.settings;
    const chunks: Array<{ md: string; skippedBefore: number }> = [];

    if (lines.length <= shortNoteThreshold) {
      chunks.push({ md: lines.join("\n"), skippedBefore: 0 });
    } else if (smartMode) {
      const HEADING_RE = /^#{2,}\s/;
      let lastHeadingIdx = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (HEADING_RE.test(lines[i])) { lastHeadingIdx = i; break; }
      }

      const cap = Math.max(3, Math.min(smartAbsoluteMax, Math.round(smartAbsoluteMax - Math.log(lines.length) * 1.2)));

      if (lastHeadingIdx >= 0) {
        const sectionLines = lines.slice(lastHeadingIdx);
        let sectionEnd = sectionLines.length;
        while (sectionEnd > 0 && !sectionLines[sectionEnd - 1].trim()) sectionEnd--;
        const section = sectionLines.slice(0, sectionEnd);

        if (section.length <= cap) {
          chunks.push({ md: section.join("\n"), skippedBefore: lastHeadingIdx });
        } else {
          const tail = section.slice(-(cap - 1));
          const skippedInline = section.length - cap;
          chunks.push({ md: section[0], skippedBefore: lastHeadingIdx });
          chunks.push({ md: tail.join("\n"), skippedBefore: skippedInline });
        }
      } else {
        const rawStart = Math.max(0, lines.length - cap);
        const start = safeTailStart(rawStart);
        if (start < lines.length) {
          let end = lines.length;
          while (end > start && !lines[end - 1].trim()) end--;
          chunks.push({ md: lines.slice(start, end).join("\n"), skippedBefore: start });
        }
      }
    } else {
      let end = Math.min(maxLines, lines.length);
      while (end > 0 && !lines[end - 1].trim()) end--;
      chunks.push({ md: lines.slice(0, end).join("\n"), skippedBefore: 0 });
    }

    const card: CachedCard = { path: target.path, basename: target.basename, timeVal, location, fmFields, chunks };
    await this.renderCardFromData(card, groupEl);
    return card;
  }

  private async renderCardFromData(card: CachedCard, groupEl: HTMLElement): Promise<void> {
    const wrapper = groupEl.createDiv({ cls: "continue-note-block" });

    const header = wrapper.createDiv({ cls: "continue-note-block__header" });

    const actions = header.createEl("span", { cls: "continue-note-block__actions" });

    const catBtn = actions.createEl("span", { cls: "continue-note-block__action-btn" });
    setIcon(catBtn, "link-2");
    catBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const file = this.app.vault.getAbstractFileByPath(card.path);
      if (!(file instanceof TFile)) return;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      const field = this.settings.categorizeField;
      new CategorizeModal(this.app, file, field, fm[field] ?? null, async (newVal, newFolder) => {
        try {
          if (newVal !== undefined) {
            await this.app.fileManager.processFrontMatter(file, (data) => {
              if (newVal === null) delete data[field];
              else data[field] = newVal;
            });
          }
          if (newFolder) {
            const newPath = normalizePath(newFolder + "/" + file.name);
            await this.app.fileManager.renameFile(file, newPath);
          }
        } catch (e) {
          new Notice(`Categorize failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          await this.render().catch(() => {});
        }
      }).open();
    });

    const trashBtn = actions.createEl("span", { cls: "continue-note-block__action-btn continue-note-block__action-btn--trash" });
    setIcon(trashBtn, "trash");
    trashBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const file = this.app.vault.getAbstractFileByPath(card.path);
      if (file instanceof TFile) await this.app.vault.trash(file, true);
      await this.render();
    });

    const titleEl = header.createDiv({ cls: "continue-note-block__title" });
    titleEl.textContent = card.basename;
    titleEl.addEventListener("click", () => {
      this.app.workspace.openLinkText(card.path, this.ctx.sourcePath ?? "", false);
    });

    const meta = header.createDiv({ cls: "continue-note-block__meta" });
    meta.createSpan({ text: relativeTime(card.timeVal) });

    if (card.location) {
      meta.createSpan({ cls: "continue-note-block__meta-sep", text: "·" });
      meta.createSpan({ text: card.location });
    }

    if (card.fmFields.length > 0) {
      const fmRow = header.createDiv({ cls: "continue-note-block__fm" });
      for (const { key, val } of card.fmFields) {
        const chip = fmRow.createSpan({ cls: "continue-note-block__fm-chip" });
        chip.createSpan({ cls: "continue-note-block__fm-key", text: key });
        chip.createSpan({ cls: "continue-note-block__fm-val", text: val });
      }
    }

    wrapper.createEl("hr", { cls: "continue-note-block__divider" });

    if (card.chunks.some((c) => c.md.trim())) {
      const previewEl = wrapper.createDiv({ cls: "continue-note-block__preview" });
      for (const chunk of card.chunks) {
        if (chunk.skippedBefore > 0) {
          previewEl.createDiv({
            cls: "continue-note-block__skip",
            text: `skipping ${chunk.skippedBefore} line${chunk.skippedBefore === 1 ? "" : "s"}`,
          });
        }
        if (chunk.md.trim()) {
          const mdEl = previewEl.createDiv();
          await MarkdownRenderer.render(this.app, closeOpenFences(chunk.md), mdEl, card.path, this);
        }
      }
    }
  }
}
