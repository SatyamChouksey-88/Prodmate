/**
 * Shared AbortSignal helpers for Gemini + tracker HTTP calls.
 * Timeouts must abort the in-flight request, not only abandon waiting.
 */

export function timeoutSignal(ms: number, parent?: AbortSignal): AbortSignal {
  const timed = AbortSignal.timeout(ms);
  if (!parent) return timed;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([parent, timed]);
  }
  // Fallback if AbortSignal.any is unavailable
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (parent.aborted || timed.aborted) {
    controller.abort();
    return controller.signal;
  }
  parent.addEventListener('abort', onAbort, { once: true });
  timed.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'))
  );
}
