import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildEpicListBody,
  buildStoryTaskBody,
  storyMarkdown,
} from '../../../shared/trackers/clickUp.js';
import { CLICKUP_CORE_FIXTURE } from '../../../shared/trackers/clickUp.fixture.js';

const dir = dirname(fileURLToPath(import.meta.url));

describe('ClickUp shared-core identity (BE)', () => {
  it('adapter imports shared/trackers/clickUp and does not re-implement builders', () => {
    const src = readFileSync(join(dir, 'clickUpAdapter.ts'), 'utf8');
    expect(src).toMatch(/from ['"].*shared\/trackers\/clickUp\.js['"]/);
    expect(src).toMatch(/buildEpicListBody/);
    expect(src).toMatch(/buildStoryTaskBody/);
    expect(src).not.toMatch(/function storyMarkdown/);
    expect(src).not.toMatch(/function valueRiskTags/);
    expect(src).not.toMatch(/from ['"].*markdownEscape\.js['"]/);
  });

  it('produces the same core outputs as the shared module fixture', () => {
    expect(
      buildEpicListBody(
        CLICKUP_CORE_FIXTURE.epicTitle,
        CLICKUP_CORE_FIXTURE.epicDescription
      )
    ).toEqual({
      name: 'Epic One',
      markdown_content: '\\# Epic heading',
    });
    const story = buildStoryTaskBody(
      CLICKUP_CORE_FIXTURE.storyTitle,
      CLICKUP_CORE_FIXTURE.storyDetails,
      CLICKUP_CORE_FIXTURE.parentTaskId
    );
    expect(story.tags).toEqual(['value:High', 'risk:Low']);
    expect(storyMarkdown(CLICKUP_CORE_FIXTURE.storyDetails)).toBe(
      story.markdown_description
    );
  });
});
