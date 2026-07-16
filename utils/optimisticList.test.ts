import { describe, expect, it, vi } from 'vitest';
import { optimisticDeleteById, reinsertAt, removeById } from './optimisticList';

describe('optimisticList', () => {
  const items = [
    { id: 'a', title: 'Alpha' },
    { id: 'b', title: 'Beta' },
    { id: 'c', title: 'Gamma' },
  ];

  it('removeById drops the matching row and records its index', () => {
    const { next, removed, index } = removeById(items, 'b');
    expect(index).toBe(1);
    expect(removed).toEqual({ id: 'b', title: 'Beta' });
    expect(next).toEqual([
      { id: 'a', title: 'Alpha' },
      { id: 'c', title: 'Gamma' },
    ]);
  });

  it('reinsertAt restores the original order', () => {
    const { next, removed, index } = removeById(items, 'b');
    expect(reinsertAt(next, removed!, index)).toEqual(items);
  });

  it('optimisticDeleteById re-inserts the item when commit fails', async () => {
    const result = await optimisticDeleteById(items, 'b', async () => {
      throw new Error('forced delete failure');
    });
    expect(result.rolledBack).toBe(true);
    expect(result.items).toEqual(items);
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe('forced delete failure');
  });

  it('optimisticDeleteById keeps the removal when commit succeeds', async () => {
    const commit = vi.fn(async () => undefined);
    const result = await optimisticDeleteById(items, 'b', commit);
    expect(commit).toHaveBeenCalledWith('b');
    expect(result.rolledBack).toBe(false);
    expect(result.items.map((i) => i.id)).toEqual(['a', 'c']);
  });
});
