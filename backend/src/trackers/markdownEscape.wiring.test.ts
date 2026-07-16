import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { escapeMarkdown } from '../../../shared/markdownEscape.js';

const dir = dirname(fileURLToPath(import.meta.url));

describe('Jira/ClickUp markdown escape wiring (BE)', () => {
  it('jiraAdapter escapes via toAdf before ADF text nodes', () => {
    const src = readFileSync(join(dir, 'jiraAdapter.ts'), 'utf8');
    expect(src).toMatch(/from ['"].*markdownEscape\.js['"]/);
    expect(src).toMatch(/escapeMarkdown\(text\)/);
  });

  it('clickUpAdapter escapes story/epic/feature markdown fields', () => {
    const src = readFileSync(join(dir, 'clickUpAdapter.ts'), 'utf8');
    expect(src).toMatch(/from ['"].*markdownEscape\.js['"]/);
    expect(src).toMatch(/escapeMarkdown\(details\.description/);
    expect(src).toMatch(/markdown_content = escapeMarkdown/);
    expect(src).toMatch(/markdown_description = escapeMarkdown/);
  });

  it('escaped heading and link stay non-formatting', () => {
    expect(escapeMarkdown('# Heading')).toBe('\\# Heading');
    expect(escapeMarkdown('[text](url)')).toBe('\\[text\\]\\(url\\)');
  });
});
