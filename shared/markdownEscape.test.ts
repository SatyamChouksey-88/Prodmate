import { describe, expect, it } from 'vitest';
import { escapeMarkdown } from './markdownEscape.js';

describe('escapeMarkdown', () => {
  it('escapes a leading Markdown heading so it stays literal', () => {
    expect(escapeMarkdown('# Heading')).toBe('\\# Heading');
    expect(escapeMarkdown('# Heading').startsWith('#')).toBe(false);
  });

  it('escapes markdown links so [text](url) is literal', () => {
    const out = escapeMarkdown('See [docs](https://example.com)');
    expect(out).toBe('See \\[docs\\]\\(https://example\\.com\\)');
    expect(out).not.toMatch(/\[docs\]\(/);
  });

  it('escapes emphasis markers', () => {
    expect(escapeMarkdown('use *bold* and _italic_')).toBe(
      'use \\*bold\\* and \\_italic\\_'
    );
  });

  it('escapes backslashes before other specials', () => {
    expect(escapeMarkdown('path\\to\\*file')).toBe('path\\\\to\\\\\\*file');
  });
});
