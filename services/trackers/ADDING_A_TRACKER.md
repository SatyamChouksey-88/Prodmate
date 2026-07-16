/**
 * How to add another work tracker (Linear, GitHub Issues, Monday, Trello, …)
 *
 * 1. Add a config variant to `TrackerConfig` in `types.ts` (FE + BE)
 * 2. Implement `WorkItemTrackerAdapter` in `<name>Adapter.ts` on FE and BE
 *    - Map Epic / Feature / Story to that tool's native model
 *    - Map optional `StoryDetails.storyPoints` when the tracker has a native field
 *      (probe before write — soft-fail if missing); ClickUp appends to description
 *    - For tools without a mid-level Feature, follow D8(c): virtual Feature ref + labels
 *    - ClickUp (D12) uses real hierarchy: Epic→List, Feature→Task, Story→Subtask
 *    - Implement `listExistingItems` for backlog duplicate detection (Phase 11)
 * 3. Register in `createTrackerAdapter()` in `index.ts` (FE + BE)
 * 4. Add SettingsPanel fields for the new provider
 * 5. Widen `tracker_configs.provider` CHECK via additive schema if needed
 *
 * Do not change `exportBacklog.ts` unless the shared orchestration must change.
 * Export rate limits apply via shared `/api/export` — no per-adapter limit config.
 */
