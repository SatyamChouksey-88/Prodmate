import type { WorkItemRef, WorkItemTrackerAdapter } from './types.js';

export type EpicPayload = {
  epic: string;
  epic_description: string;
  features: Array<{
    feature: string;
    feature_description: string;
    user_stories: Array<{
      id: string;
      story: string;
      acceptance_criteria: string[];
      business_value: 'High' | 'Medium' | 'Low';
      risk_impact: 'High' | 'Medium' | 'Low';
      dependencies: string[];
      story_points?: 1 | 2 | 3 | 5 | 8 | 13;
    }>;
  }>;
};

export type CreatedWorkItem = {
  kind: 'epic' | 'feature' | 'story';
  title: string;
  ref: WorkItemRef;
};

export type ExportResult = {
  created: CreatedWorkItem[];
};

export async function exportBacklog(
  adapter: WorkItemTrackerAdapter,
  epics: EpicPayload[],
  onProgress: (message: string) => void
): Promise<ExportResult> {
  const storyIdToRef = new Map<string, WorkItemRef>();
  const created: CreatedWorkItem[] = [];
  onProgress(`Starting export via ${adapter.provider}...`);

  for (const epic of epics) {
    onProgress(`Creating Epic: "${epic.epic}"`);
    const epicRef = await adapter.createEpic(epic.epic, epic.epic_description);
    created.push({ kind: 'epic', title: epic.epic, ref: epicRef });

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
        created.push({ kind: 'feature', title: feature.feature, ref: featureRef });
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
            storyPoints: story.story_points,
          },
          featureRef
        );
        created.push({ kind: 'story', title: story.story, ref: storyRef });

        if (!featureRef.virtualFeature) {
          await adapter.linkParent(storyRef, featureRef);
        }
        storyIdToRef.set(story.id, storyRef);
      }
    }
  }

  onProgress('Adding dependency links...');
  const allStories = epics.flatMap((e) => e.features.flatMap((f) => f.user_stories));
  const linkPromises: Promise<void>[] = [];

  for (const story of allStories) {
    if (!story.dependencies?.length) continue;
    const storyRef = storyIdToRef.get(story.id);
    if (!storyRef) continue;
    for (const depId of story.dependencies) {
      const dependencyRef = storyIdToRef.get(depId);
      if (!dependencyRef) continue;
      linkPromises.push(adapter.linkDependency(storyRef, dependencyRef));
    }
  }

  if (linkPromises.length) {
    const results = await Promise.allSettled(linkPromises);
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) {
      console.warn(`${failed.length} dependency links failed`);
    }
  }

  onProgress('Export complete!');
  return { created };
}
