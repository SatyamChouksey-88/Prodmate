/** Shared fixture for FE + BE identity tests (same inputs → same outputs). */
export const CLICKUP_CORE_FIXTURE = {
  storyDetails: {
    description: '# Heading\nSee [docs](https://example.com)',
    acceptanceCriteria: ['Must handle *emphasis*', 'Open [link](https://x.test)'],
    businessValue: 'High' as const,
    riskImpact: 'Low' as const,
    storyPoints: 5 as const,
  },
  epicTitle: 'Epic One',
  epicDescription: '# Epic heading',
  featureTitle: 'Feature One',
  featureDescription: 'Has [link](https://f.test)',
  storyTitle: 'As a user I want X',
  parentTaskId: 'parent-99',
};
