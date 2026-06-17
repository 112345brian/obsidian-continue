export const API_VERSION = 1;

export interface ContinueNoteApi {
  version: typeof API_VERSION;
  getRecentPaths(limit?: number): string[];
}
