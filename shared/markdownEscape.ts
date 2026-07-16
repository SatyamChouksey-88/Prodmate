/**
 * Escape Markdown special characters so AI-generated text stays literal
 * in ClickUp markdown_description / markdown_content and in plain strings
 * that may be interpreted as Markdown elsewhere.
 *
 * Escapes: \, `, *, _, {, }, [, ], (, ), #, +, -, ., !, |
 * (CommonMark-ish set; backslash first.)
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!|])/g, '\\$1');
}
