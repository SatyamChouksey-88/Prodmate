import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { escapeMarkdown } from '../../shared/markdownEscape';

const dir = dirname(fileURLToPath(import.meta.url));

describe('Jira/ClickUp markdown escape wiring (FE)', () => {
  it('jiraAdapter escapes via toAdf before ADF text nodes', () => {
    const src = readFileSync(join(dir, 'jiraAdapter.ts'), 'utf8');
    expect(src).toMatch(/from ['"].*markdownEscape['"]/);
    expect(src).toMatch(/escapeMarkdown\(text\)/);
  });

  it('clickUpAdapter uses shared/trackers/clickUp for markdown fields', () => {
    const src = readFileSync(join(dir, 'clickUpAdapter.ts'), 'utf8');
    expect(src).toMatch(/from ['"].*shared\/trackers\/clickUp['"]/);
    expect(src).toMatch(/buildEpicListBody|buildFeatureTaskBody|buildStoryTaskBody/);
  });

  it('escaped heading and link stay non-formatting', () => {
    expect(escapeMarkdown('# Heading')).toBe('\\# Heading');
    expect(escapeMarkdown('[text](url)')).toBe('\\[text\\]\\(url\\)');
  });
});
