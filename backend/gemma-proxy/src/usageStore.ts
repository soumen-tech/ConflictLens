/**
 * usageStore.ts
 *
 * Tracks per-deviceId scan counts for the free-tier allowance.
 *
 * ⚠️  IMPORTANT — CURRENT STORAGE: IN-MEMORY ONLY
 * This implementation uses a plain Map. All counts are lost on server restart.
 * This is intentional for the initial version — it keeps the server stateless
 * and dependency-free. See README.md ("Persistence upgrade path") for how to
 * swap in a persistent backend (Redis, SQLite, etc.) when needed.
 *
 * The UsageStore interface below is the only contract the server depends on.
 * Replacing this module with a persistent implementation requires no changes
 * to server.ts.
 */

// ─── Interface ────────────────────────────────────────────────────────────────

export interface UsageStore {
  /**
   * Returns the number of scans consumed by this deviceId.
   * Returns 0 for unknown deviceIds.
   */
  getCount(deviceId: string): number;

  /**
   * Increments the scan count for the given deviceId and returns the NEW count.
   */
  increment(deviceId: string): number;
}

// ─── In-memory implementation ────────────────────────────────────────────────

class InMemoryUsageStore implements UsageStore {
  private readonly counts = new Map<string, number>();

  getCount(deviceId: string): number {
    return this.counts.get(deviceId) ?? 0;
  }

  increment(deviceId: string): number {
    const next = this.getCount(deviceId) + 1;
    this.counts.set(deviceId, next);
    return next;
  }
}

// Singleton — one store shared across all requests in this process.
export const usageStore: UsageStore = new InMemoryUsageStore();
