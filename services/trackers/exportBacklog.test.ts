import { describe, it, expect, vi } from 'vitest';
import { exportBacklog } from './exportBacklog';
import type { Epic } from '../../types';
import type { WorkItemRef, WorkItemTrackerAdapter } from './types';

function makeAdapter(overrides: Partial<WorkItemTrackerAdapter> = {}): WorkItemTrackerAdapter {
  let seq = 1;
  const nextRef = (prefix: string): WorkItemRef => {
    const id = String(seq++);
    return { id, url: `https://example.test/${prefix}/${id}`, key: `${prefix}-${id}` };
  };

  const adapter: WorkItemTrackerAdapter = {
    provider: 'azure-devops',
    testConnection: vi.fn(async () => 'ok'),
    createEpic: vi.fn(async (title) => nextRef(`epic-${title}`)),
    createFeature: vi.fn(async (title) => nextRef(`feature-${title}`)),
    createUserStory: vi.fn(async (title) => nextRef(`story-${title}`)),
    linkParent: vi.fn(async () => undefined),
    linkDependency: vi.fn(async () => undefined),
    ...overrides,
  };
  return adapter;
}

const sampleEpics: Epic[] = [
  {
    epic: 'Lunch Form',
    epic_description: 'Order lunch',
    features: [
      {
        feature: 'Menu',
        feature_description: 'Show menu',
        user_stories: [
          {
            id: 'US1',
            story: 'As a user I can see the menu',
            acceptance_criteria: ['Menu loads'],
            business_value: 'High',
            risk_impact: 'Low',
            dependencies: [],
          },
          {
            id: 'US2',
            story: 'As a user I can submit an order',
            acceptance_criteria: ['Order saved'],
            business_value: 'Medium',
            risk_impact: 'Medium',
            dependencies: ['US1'],
          },
        ],
      },
    ],
  },
];

describe('WorkItemTrackerAdapter contract via exportBacklog', () => {
  it('calls createEpic, createFeature, createUserStory, and parent links for ADO-style adapters', async () => {
    const adapter = makeAdapter();
    const progress: string[] = [];
    const result = await exportBacklog(adapter, sampleEpics, (m) => progress.push(m));

    expect(adapter.createEpic).toHaveBeenCalledTimes(1);
    expect(adapter.createFeature).toHaveBeenCalledTimes(1);
    expect(adapter.createUserStory).toHaveBeenCalledTimes(2);
    expect(adapter.linkParent).toHaveBeenCalled();
    expect(adapter.linkDependency).toHaveBeenCalled();
    expect(result.created.filter((c) => c.kind === 'epic')).toHaveLength(1);
    expect(result.created.filter((c) => c.kind === 'feature')).toHaveLength(1);
    expect(result.created.filter((c) => c.kind === 'story')).toHaveLength(2);
    expect(result.created.every((c) => c.ref.id && c.ref.url)).toBe(true);
    expect(progress.some((p) => /Export complete/i.test(p))).toBe(true);
  });

  it('skips parent links for virtual Jira features (D8c)', async () => {
    const adapter = makeAdapter({
      provider: 'jira',
      createFeature: vi.fn(async (title, _desc, epic) => ({
        id: `virtual-${title}`,
        url: '',
        virtualFeature: {
          label: `feature:${title}`,
          epicId: epic.id,
          epicKey: epic.key,
          featureTitle: title,
        },
      })),
    });

    await exportBacklog(adapter, sampleEpics, () => undefined);

    expect(adapter.createFeature).toHaveBeenCalled();
    expect(adapter.linkParent).not.toHaveBeenCalled();
    expect(adapter.createUserStory).toHaveBeenCalledTimes(2);
  });

  it('creates real Feature tasks for ClickUp-style adapters (no virtualFeature)', async () => {
    const adapter = makeAdapter({ provider: 'clickup' });
    const result = await exportBacklog(adapter, sampleEpics, () => undefined);

    expect(adapter.createEpic).toHaveBeenCalledTimes(1);
    expect(adapter.createFeature).toHaveBeenCalledTimes(1);
    expect(adapter.createUserStory).toHaveBeenCalledTimes(2);
    expect(adapter.linkParent).toHaveBeenCalled();
    expect(result.created.filter((c) => c.kind === 'feature')).toHaveLength(1);
    expect(result.created.every((c) => c.kind !== 'feature' || Boolean(c.ref.url))).toBe(true);
  });

  it('aborts mid-loop and reports partial created items', async () => {
    const { ExportAbortedError } = await import('./exportBacklog');
    const controller = new AbortController();
    const adapter = makeAdapter({
      createEpic: vi.fn(async () => {
        const ref = { id: '1', url: 'https://example.test/1', key: 'E-1' };
        controller.abort();
        return ref;
      }),
    });

    try {
      await exportBacklog(adapter, sampleEpics, () => undefined, controller.signal);
      expect.unreachable('expected ExportAbortedError');
    } catch (err) {
      expect(err).toBeInstanceOf(ExportAbortedError);
      const aborted = err as InstanceType<typeof ExportAbortedError>;
      expect(aborted.created).toHaveLength(1);
      expect(aborted.created[0].kind).toBe('epic');
      expect(adapter.createUserStory).not.toHaveBeenCalled();
    }
  });
});
