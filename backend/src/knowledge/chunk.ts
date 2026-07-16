/**
 * Approximate token estimate (~4 chars/token) and chunking for Knowledge Mesh.
 * Target ~600 tokens with ~12% overlap (D11 ingest path).
 */
const CHARS_PER_TOKEN = 4;
export const TARGET_TOKENS = 600;
export const OVERLAP_RATIO = 0.12;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function targetChars(): number {
  return TARGET_TOKENS * CHARS_PER_TOKEN;
}

function overlapChars(): number {
  return Math.floor(targetChars() * OVERLAP_RATIO);
}

/**
 * Split text into overlapping chunks of ~500–800 tokens (target 600).
 */
export function chunkText(raw: string): string[] {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const maxChars = targetChars();
  const overlap = overlapChars();
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const pieces: string[] = [];
  let buffer = '';

  const flush = (force = false) => {
    if (!buffer.trim()) return;
    if (estimateTokens(buffer) >= TARGET_TOKENS * 0.5 || force) {
      pieces.push(buffer.trim());
      buffer = '';
    }
  };

  for (const para of paragraphs) {
    if (estimateTokens(para) > TARGET_TOKENS * 1.4) {
      flush(true);
      // Hard-split oversized paragraphs by sentence / length
      let remaining = para;
      while (estimateTokens(remaining) > TARGET_TOKENS) {
        const cut = remaining.slice(0, maxChars);
        const lastBreak = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'), cut.lastIndexOf(' '));
        const end = lastBreak > maxChars * 0.4 ? lastBreak + 1 : maxChars;
        pieces.push(remaining.slice(0, end).trim());
        remaining = remaining.slice(Math.max(0, end - overlap)).trimStart();
      }
      if (remaining) buffer = remaining;
      continue;
    }

    const candidate = buffer ? `${buffer}\n\n${para}` : para;
    if (estimateTokens(candidate) <= TARGET_TOKENS * 1.15) {
      buffer = candidate;
    } else {
      flush(true);
      buffer = para;
    }
  }
  flush(true);

  // Apply overlap between consecutive chunks when we flushed without overlap
  if (pieces.length <= 1) return pieces;

  const overlapped: string[] = [pieces[0]];
  for (let i = 1; i < pieces.length; i++) {
    const prev = pieces[i - 1];
    const prefix = prev.slice(Math.max(0, prev.length - overlap));
    const next = pieces[i];
    overlapped.push(prefix && !next.startsWith(prefix.trim()) ? `${prefix.trim()}\n${next}` : next);
  }
  return overlapped.filter(Boolean);
}
