/**
 * How to add another work tracker (Linear, GitHub Issues, Monday, Trello, …)
 *
 * 1. Add a config variant to `TrackerConfig` in `types.ts`
 * 2. Implement `WorkItemTrackerAdapter` in `<name>Adapter.ts`
 *    - Map Epic / Feature / Story to that tool's native model
 *    - For tools without a mid-level Feature, follow D8(c): virtual Feature ref + labels
 * 3. Register in `createTrackerAdapter()` in `index.ts`
 * 4. Add SettingsPanel fields for the new provider
 *
 * Do not change `exportBacklog.ts` unless the shared orchestration must change.
 */
export {};
