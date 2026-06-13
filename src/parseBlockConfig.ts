export interface BlockConfig {
  count: number | null; // null means "use the global setting"
  exclude: string[];
}

const DEFAULTS: BlockConfig = {
  count: null,
  exclude: [],
};

export function parseBlockConfig(source: string): BlockConfig {
  const config: BlockConfig = { ...DEFAULTS };

  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(":")) continue;

    const colonIdx = trimmed.indexOf(":");
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (key === "count") {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed) && parsed > 0) config.count = parsed;
    } else if (key === "exclude") {
      config.exclude = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  return config;
}
