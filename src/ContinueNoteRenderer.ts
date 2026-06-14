import { App, MarkdownRenderChild, MarkdownRenderer, TFile, setIcon } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import { BlockConfig, Slot } from "./parseBlockConfig";
import { getTrashCollectionApi } from "./TrashCollectionApi";
import type { ContinueNoteSettings, SortBy } from "./settings";

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

// Returns an array where insideBlock[i] = true if line i is inside a fenced block
// (including the fence lines themselves).
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

// If md has an unclosed fence, close it.
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
  constructor(
    private app: App,
    private config: BlockConfig,
    private settings: ContinueNoteSettings,
    private getOpenedLog: () => string[],
    el: HTMLElement,
    private ctx: MarkdownPostProcessorContext
  ) {
    super(el);
  }

  async onload() {
    await this.render();
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", async () => {
        const active = this.app.workspace.getActiveFile();
        if (active?.path === this.ctx.sourcePath) await this.render();
      })
    );
  }

  async render() {
    this.containerEl.empty();

    const exclude = [...this.settings.exclude, ...this.config.exclude];
    const { sortFrontmatterField } = this.settings;

    const scoreFor = (sortBy: SortBy) => (f: TFile): number => {
      if (sortBy === "created") return f.stat.ctime;
      if (sortBy === "frontmatter") {
        const val = this.app.metadataCache.getFileCache(f)?.frontmatter?.[sortFrontmatterField];
        if (val) { const t = Date.parse(String(val)); if (!isNaN(t)) return t; }
        return 0;
      }
      if (sortBy === "opened") {
        const log = this.getOpenedLog();
        const idx = log.indexOf(f.path);
        return idx === -1 ? 0 : log.length - idx;
      }
      return f.stat.mtime;
    };

    const pool = this.app.vault.getMarkdownFiles().filter((f) => {
      if (f.path === this.ctx.sourcePath) return false;
      return !exclude.some((prefix) => f.path.startsWith(prefix));
    });

    // Resolve slots — either from block config or global setting
    const slots: Slot[] = this.config.slots ?? [
      { sortBy: this.settings.sortBy, count: this.settings.count },
    ];

    const trashApi = getTrashCollectionApi(this.app);

    // Pick targets slot by slot, deduping across slots
    const seen = new Set<string>();
    const targets: TFile[] = [];
    for (const slot of slots) {
      if (slot.sortBy === "orphan") {
        if (!trashApi) continue;
        const orphans = trashApi.getCandidates()
          .filter((f) => !seen.has(f.path) && !exclude.some((p) => f.path.startsWith(p)));
        for (const f of orphans.slice(0, slot.count)) {
          seen.add(f.path);
          targets.push(f);
        }
        continue;
      }
      const sorted = [...pool].sort((a, b) => scoreFor(slot.sortBy)(b) - scoreFor(slot.sortBy)(a));
      let picked = 0;
      for (const f of sorted) {
        if (seen.has(f.path)) continue;
        seen.add(f.path);
        targets.push(f);
        if (++picked >= slot.count) break;
      }
    }

    const capped = targets.slice(0, this.settings.maxTotal);

    if (capped.length === 0) {
      const wrapper = this.containerEl.createDiv({ cls: "continue-note-block" });
      wrapper.createDiv({ cls: "continue-note-block__empty", text: "No notes found." });
      return;
    }

    for (const target of capped) {
      await this.renderCard(target);
    }
  }

  async renderCard(target: TFile) {
    const wrapper = this.containerEl.createDiv({ cls: "continue-note-block" });

    const header = wrapper.createDiv({ cls: "continue-note-block__header" });

    const trashBtn = header.createEl("span", { cls: "continue-note-block__trash" });
    setIcon(trashBtn, "trash");
    trashBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await this.app.vault.trash(target, true);
      await this.render();
    });

    const titleEl = header.createDiv({ cls: "continue-note-block__title" });
    titleEl.textContent = target.basename;
    titleEl.addEventListener("click", () => {
      this.app.workspace.openLinkText(target.path, this.ctx.sourcePath ?? "", false);
    });

    const meta = header.createDiv({ cls: "continue-note-block__meta" });
    const timeVal = this.settings.sortBy === "created" ? target.stat.ctime : target.stat.mtime;
    meta.createSpan({ text: relativeTime(timeVal) });

    const graph = getBCGraph(this.app);
    const chain = graph ? getBCParentChain(graph, target.path, this.app) : [];
    const location = chain.length > 0
      ? chain.join(" › ")
      : (target.parent?.name && target.parent.name !== "/" ? target.parent.name : null);

    if (location) {
      meta.createSpan({ cls: "continue-note-block__meta-sep", text: "·" });
      meta.createSpan({ text: location });
    }

    const fields = this.config.frontmatterFields ?? this.settings.frontmatterFields;
    if (fields.length > 0) {
      const fm = this.app.metadataCache.getFileCache(target)?.frontmatter ?? {};
      const fmRow = header.createDiv({ cls: "continue-note-block__fm" });
      for (const key of fields) {
        const val = fm[key];
        if (val == null) continue;
        const chip = fmRow.createSpan({ cls: "continue-note-block__fm-chip" });
        chip.createSpan({ cls: "continue-note-block__fm-key", text: key });
        chip.createSpan({ cls: "continue-note-block__fm-val", text: Array.isArray(val) ? val.join(", ") : String(val) });
      }
    }

    wrapper.createEl("hr", { cls: "continue-note-block__divider" });

    const raw = await this.app.vault.read(target);
    const body = raw.replace(FRONTMATTER_RE, "").trimStart();
    const lines = body.split("\n");
    const fenceMap = buildFenceMap(lines);

    // Find the last safe start index at or after `from` that isn't inside a fence.
    const safeTailStart = (from: number) => {
      let i = from;
      while (i < lines.length && fenceMap[i]) i++;
      return i;
    };

    const { smartMode, smartAbsoluteMax, shortNoteThreshold, maxLines } = this.settings;

    // Each chunk: { markdown: string, skippedBefore: number }
    // skippedBefore > 0 means "N lines were skipped before this chunk"
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

    if (chunks.some((c) => c.md.trim())) {
      const previewEl = wrapper.createDiv({ cls: "continue-note-block__preview" });
      for (const chunk of chunks) {
        if (chunk.skippedBefore > 0) {
          previewEl.createDiv({
            cls: "continue-note-block__skip",
            text: `skipping ${chunk.skippedBefore} line${chunk.skippedBefore === 1 ? "" : "s"}`,
          });
        }
        if (chunk.md.trim()) {
          const mdEl = previewEl.createDiv();
          await MarkdownRenderer.render(this.app, closeOpenFences(chunk.md), mdEl, target.path, this);
        }
      }
    }

  }
}
