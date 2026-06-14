import type { SortBy } from "./settings";

export interface Slot {
  sortBy: SortBy;
  count: number;
}

export interface BlockConfig {
  slots: Slot[] | null;  // null means use global settings count+sortBy
  exclude: string[];
  frontmatterFields: string[] | null;
}

const SORT_KEYS = new Set<string>(["modified", "created", "frontmatter", "opened", "orphan"]);

const DEFAULTS: BlockConfig = {
  slots: null,
  exclude: [],
  frontmatterFields: null,
};

export function parseBlockConfig(source: string): BlockConfig {
  const config: BlockConfig = { ...DEFAULTS };
  const slots: Slot[] = [];

  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(":")) continue;

    const colonIdx = trimmed.indexOf(":");
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (SORT_KEYS.has(key)) {
      const n = parseInt(value, 10);
      slots.push({ sortBy: key as SortBy, count: isNaN(n) || n < 1 ? 1 : n });
    } else if (key === "count") {
      const n = parseInt(value, 10);
      if (!isNaN(n) && n > 0) slots.push({ sortBy: "modified", count: n });
    } else if (key === "frontmatter") {
      config.frontmatterFields = value.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (key === "exclude") {
      config.exclude = value.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  if (slots.length > 0) config.slots = slots;
  return config;
}
