import type { App, TFile } from "obsidian";

// Mirrors trash-collection/src/api.ts — update version if the API changes.
const PLUGIN_ID = "trash-collection";
const EXPECTED_VERSION = 1;

export interface TrashCollectionApi {
  readonly version: number;
  getCandidates(): TFile[];
  openTriage(): Promise<void>;
}

export function getTrashCollectionApi(app: App): TrashCollectionApi | null {
  const plugin = (app as any).plugins?.plugins?.[PLUGIN_ID];
  if (!plugin?.api || plugin.api.version !== EXPECTED_VERSION) return null;
  return plugin.api as TrashCollectionApi;
}
