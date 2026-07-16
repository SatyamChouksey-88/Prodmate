import { describe, expect, it } from 'vitest';
import {
  VALUE_RISK_TAGS,
  buildDependencyBody,
  buildEpicListBody,
  buildFeatureTaskBody,
  buildSpaceTagCreateBody,
  buildStoryTaskBody,
  clampBacklogLimit,
  clickUpListUrl,
  clickUpTaskUrl,
  mapClickUpTaskToExistingItem,
  storyMarkdown,
  valueRiskTags,
} from './clickUp.js';
import { CLICKUP_CORE_FIXTURE } from './clickUp.fixture.js';

describe('shared ClickUp adapter-core', () => {
  it('exports the six value/risk Space tag names', () => {
    expect([...VALUE_RISK_TAGS]).toEqual([
      'value:High',
      'value:Medium',
      'value:Low',
      'risk:High',
      'risk:Medium',
      'risk:Low',
    ]);
  });

  it('builds value/risk tags from story details', () => {
    expect(valueRiskTags(CLICKUP_CORE_FIXTURE.storyDetails)).toEqual([
      'value:High',
      'risk:Low',
    ]);
    expect(valueRiskTags({})).toEqual([]);
  });

  it('escapes markdown in storyMarkdown while keeping structure headings', () => {
    const md = storyMarkdown(CLICKUP_CORE_FIXTURE.storyDetails);
    expect(md).toContain('\\# Heading');
    expect(md).toContain('\\[docs\\]');
    expect(md).toContain('## Acceptance Criteria');
    expect(md).toContain('Story points: 5');
    expect(md).not.toMatch(/(^|\n)# Heading/);
  });

  it('builds epic / feature / story request bodies', () => {
    expect(
      buildEpicListBody(
        CLICKUP_CORE_FIXTURE.epicTitle,
        CLICKUP_CORE_FIXTURE.epicDescription
      )
    ).toEqual({
      name: 'Epic One',
      markdown_content: '\\# Epic heading',
    });
    expect(buildEpicListBody('Bare')).toEqual({ name: 'Bare' });

    expect(
      buildFeatureTaskBody(
        CLICKUP_CORE_FIXTURE.featureTitle,
        CLICKUP_CORE_FIXTURE.featureDescription
      )
    ).toEqual({
      name: 'Feature One',
      markdown_description: 'Has \\[link\\]\\(https://f\\.test\\)',
    });

    const storyBody = buildStoryTaskBody(
      CLICKUP_CORE_FIXTURE.storyTitle,
      CLICKUP_CORE_FIXTURE.storyDetails,
      CLICKUP_CORE_FIXTURE.parentTaskId
    );
    expect(storyBody.name).toBe(CLICKUP_CORE_FIXTURE.storyTitle);
    expect(storyBody.parent).toBe('parent-99');
    expect(storyBody.tags).toEqual(['value:High', 'risk:Low']);
    expect(String(storyBody.markdown_description)).toContain('\\# Heading');
  });

  it('builds tag create and dependency bodies', () => {
    expect(buildSpaceTagCreateBody('value:High')).toEqual({
      tag: { name: 'value:High', tag_fg: '#ffffff', tag_bg: '#2563eb' },
    });
    expect(buildSpaceTagCreateBody('risk:Medium')).toEqual({
      tag: { name: 'risk:Medium', tag_fg: '#ffffff', tag_bg: '#b45309' },
    });
    expect(buildDependencyBody('dep-1')).toEqual({ depends_on: 'dep-1' });
  });

  it('maps URLs, limits, and backlog task rows', () => {
    expect(clickUpTaskUrl('abc')).toBe('https://app.clickup.com/t/abc');
    expect(clickUpTaskUrl('abc', 'https://custom/t')).toBe('https://custom/t');
    expect(clickUpListUrl('space1', 'list2')).toBe(
      'https://app.clickup.com/space1/v/li/list2'
    );
    expect(clampBacklogLimit(undefined)).toBe(100);
    expect(clampBacklogLimit(0)).toBe(1);
    expect(clampBacklogLimit(500)).toBe(100);
    expect(
      mapClickUpTaskToExistingItem({
        id: 't1',
        name: 'Task',
        markdown_description: 'md',
        description: 'plain',
      })
    ).toEqual({
      id: 't1',
      title: 'Task',
      description: 'md',
      url: 'https://app.clickup.com/t/t1',
    });
  });
});
