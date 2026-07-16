import type { Epic, UserStory } from '../../types';
import type { WorkItemRef, WorkItemTrackerAdapter } from './types';

/**
 * Provider-agnostic backlog export. Adapters own provider-specific mapping
 * (ADO Feature work items vs Jira D8c feature labels).
 */
export async function exportBacklog(
  adapter: WorkItemTrackerAdapter,
  epics: Epic[],
  onProgress: (message: string) => void
): Promise<void> {
  const storyIdToRef = new Map<string, WorkItemRef>();

  onProgress(`Starting export via ${adapter.provider}...`);

  for (const epic of epics) {
    onProgress(`Creating Epic: "${epic.epic}"`);
    const epicRef = await adapter.createEpic(epic.epic, epic.epic_description);

    for (const feature of epic.features) {
      onProgress(
        adapter.provider === 'jira'
          ? `Preparing Feature label: "${feature.feature}"`
          : `Creating Feature: "${feature.feature}"`
      );
      const featureRef = await adapter.createFeature(
        feature.feature,
        feature.feature_description,
        epicRef
      );

      if (!featureRef.virtualFeature) {
        onProgress(`Linking Feature "${feature.feature}" to Epic`);
        await adapter.linkParent(featureRef, epicRef);
      }

      for (const story of feature.user_stories) {
        onProgress(`Creating User Story: "${story.id}"`);
        const storyRef = await adapter.createUserStory(
          story.story,
          {
            acceptanceCriteria: story.acceptance_criteria,
            businessValue: story.business_value,
            riskImpact: story.risk_impact,
          },
          featureRef
        );

        if (!featureRef.virtualFeature) {
          onProgress(`Linking Story "${story.id}" to Feature`);
          await adapter.linkParent(storyRef, featureRef);
        }

        storyIdToRef.set(story.id, storyRef);
      }
    }
  }

  onProgress('All work items created. Adding dependency links...');

  const allStories: UserStory[] = epics.flatMap((e) =>
    e.features.flatMap((f) => f.user_stories)
  );
  const linkPromises: Promise<void>[] = [];

  for (const story of allStories) {
    if (!story.dependencies?.length) continue;
    const storyRef = storyIdToRef.get(story.id);
    if (!storyRef) continue;

    for (const depId of story.dependencies) {
      const dependencyRef = storyIdToRef.get(depId);
      if (!dependencyRef) continue;
      onProgress(`Linking ${story.id} -> ${depId}`);
      linkPromises.push(adapter.linkDependency(storyRef, dependencyRef));
    }
  }

  if (linkPromises.length > 0) {
    const results = await Promise.allSettled(linkPromises);
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.warn(`${failed.length} dependency links failed. Check console for details.`);
      failed.forEach((link) => console.error((link as PromiseRejectedResult).reason));
    }
  }

  onProgress('Export complete!');
}
