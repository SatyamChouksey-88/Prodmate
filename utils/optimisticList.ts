/** Remove an item by id; returns the next list plus enough info to roll back. */
export function removeById<T extends { id: string }>(
  items: T[],
  id: string
): { next: T[]; removed: T | undefined; index: number } {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) {
    return { next: items, removed: undefined, index: -1 };
  }
  const removed = items[index];
  const next = items.slice(0, index).concat(items.slice(index + 1));
  return { next, removed, index };
}

/** Re-insert an item at a prior index (clamped), skipping if already present. */
export function reinsertAt<T extends { id: string }>(items: T[], item: T, index: number): T[] {
  if (items.some((existing) => existing.id === item.id)) {
    return items;
  }
  const at = Math.max(0, Math.min(index < 0 ? items.length : index, items.length));
  const next = items.slice();
  next.splice(at, 0, item);
  return next;
}

/**
 * Optimistically remove, run `commit`, roll back on failure.
 * Used by history delete so a forced API failure re-inserts the row.
 */
export async function optimisticDeleteById<T extends { id: string }>(
  items: T[],
  id: string,
  commit: (id: string) => Promise<void>
): Promise<{ items: T[]; rolledBack: boolean; error?: unknown }> {
  const { next, removed, index } = removeById(items, id);
  if (!removed) {
    return { items, rolledBack: false };
  }
  try {
    await commit(id);
    return { items: next, rolledBack: false };
  } catch (error) {
    return { items: reinsertAt(next, removed, index), rolledBack: true, error };
  }
}
