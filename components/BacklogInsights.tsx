import React, { useState } from 'react';
import type { Epic } from '../types';
import {
  bucketStories,
  flattenStories,
  INSIGHT_BUCKET_LABELS,
  INSIGHT_BUCKET_ORDER,
  planSprints,
  truncateStoryText,
  type FlatStory,
  type InsightBucket,
} from '../utils/backlogInsights';

const BUCKET_HEADER_CLASS: Record<InsightBucket, string> = {
  quickWins: 'bg-success-bg text-success border-success/25',
  bigBets: 'bg-accent/10 text-accent border-accent/30',
  fillIns: 'bg-surface-muted text-foreground-secondary border-border',
  reconsider: 'bg-danger-bg text-danger border-danger/25',
};

const StorySummaryList: React.FC<{ stories: FlatStory[]; emptyLabel: string }> = ({
  stories,
  emptyLabel,
}) => {
  if (stories.length === 0) {
    return <p className="text-sm text-foreground-muted px-3 py-2">{emptyLabel}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {stories.map((s) => (
        <li key={s.id} className="px-3 py-2 text-sm">
          <span className="font-display text-[0.7rem] font-semibold text-foreground-muted mr-2">
            {s.id}
          </span>
          <span className="text-foreground-secondary">{truncateStoryText(s.story)}</span>
          {s.story_points != null && (
            <span className="ml-2 text-xs text-foreground-muted">{s.story_points} pts</span>
          )}
        </li>
      ))}
    </ul>
  );
};

interface BacklogInsightsProps {
  results: Epic[];
}

const BacklogInsights: React.FC<BacklogInsightsProps> = ({ results }) => {
  const [velocityRaw, setVelocityRaw] = useState('');
  const flat = flattenStories(results);
  const buckets = bucketStories(results);
  const velocityParsed = velocityRaw.trim() === '' ? NaN : Number(velocityRaw);
  const sprintPlan = planSprints(flat, velocityParsed);

  return (
    <div className="space-y-8">
      <section aria-labelledby="insights-quadrant-heading" className="space-y-3">
        <div>
          <h3 id="insights-quadrant-heading" className="text-lg font-bold text-foreground">
            Value / effort
          </h3>
          <p className="text-sm text-foreground-secondary">
            Suggestion surface only — buckets stories already on this backlog. Does not reorder or
            change the plan.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {INSIGHT_BUCKET_ORDER.map((key) => (
            <div
              key={key}
              className="border border-border rounded-lg overflow-hidden bg-surface"
            >
              <div
                className={`px-3 py-2 border-b text-sm font-semibold ${BUCKET_HEADER_CLASS[key]}`}
              >
                {INSIGHT_BUCKET_LABELS[key]}
                <span className="ml-2 font-normal opacity-80">({buckets[key].length})</span>
              </div>
              <StorySummaryList stories={buckets[key]} emptyLabel="None in this bucket" />
            </div>
          ))}
        </div>
        <p className="text-xs text-foreground-muted">
          Low effort = points ≤ 3 or unsized. High effort = points ≥ 5. High value = Business Value
          High; otherwise Medium/Low.
        </p>
      </section>

      <section aria-labelledby="insights-sprint-heading" className="space-y-3">
        <div>
          <h3 id="insights-sprint-heading" className="text-lg font-bold text-foreground">
            Sprint fit
          </h3>
          <p className="text-sm text-foreground-secondary">
            Rough capacity view — greedy fill in epic/feature order. Unsized stories are listed
            separately, not forced into a sprint.
          </p>
        </div>
        <label className="block max-w-xs">
          <span className="text-sm font-medium text-foreground-muted">
            Team velocity (points per sprint)
          </span>
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={velocityRaw}
            onChange={(e) => setVelocityRaw(e.target.value)}
            placeholder="e.g. 20"
            className="mt-1 w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>

        {sprintPlan == null ? (
          <p className="text-sm text-foreground-muted">
            Enter a positive velocity to see a suggested sprint split.
          </p>
        ) : (
          <div className="space-y-3">
            {sprintPlan.sprints.length === 0 ? (
              <p className="text-sm text-foreground-muted">No sized stories to place.</p>
            ) : (
              <ul className="space-y-2">
                {sprintPlan.sprints.map((sprint) => (
                  <li
                    key={sprint.index}
                    className="border border-border rounded-lg bg-surface overflow-hidden"
                  >
                    <div className="px-3 py-2 border-b border-border bg-surface-muted text-sm font-semibold text-foreground">
                      Sprint {sprint.index} — {sprint.stories.length}{' '}
                      {sprint.stories.length === 1 ? 'story' : 'stories'}, {sprint.points} points
                    </div>
                    <StorySummaryList stories={sprint.stories} emptyLabel="" />
                  </li>
                ))}
              </ul>
            )}
            {sprintPlan.unsized.length > 0 && (
              <div className="border border-dashed border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-border text-sm font-semibold text-foreground-muted bg-surface-muted">
                  Not yet sized ({sprintPlan.unsized.length})
                </div>
                <StorySummaryList stories={sprintPlan.unsized} emptyLabel="" />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default BacklogInsights;
