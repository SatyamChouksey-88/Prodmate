import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { timeoutSignal, isAbortError } from './timeout.js';

describe('timeoutSignal', () => {
  it('aborts an in-flight fetch when the timeout elapses', async () => {
    const server = http.createServer((_req, res) => {
      // Never respond — caller must abort
      void _req;
      void res;
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };

    const signal = timeoutSignal(80);
    const started = Date.now();
    let caught: unknown;
    try {
      await fetch(`http://127.0.0.1:${port}/hang`, { signal });
    } catch (err) {
      caught = err;
    } finally {
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }

    expect(caught).toBeTruthy();
    expect(isAbortError(caught) || (caught instanceof Error && /aborted|timeout/i.test(caught.message))).toBe(
      true
    );
    expect(Date.now() - started).toBeLessThan(2000);
    expect(signal.aborted).toBe(true);
  }, 10_000);

  it('propagates parent abort immediately', async () => {
    const parent = new AbortController();
    const signal = timeoutSignal(60_000, parent.signal);
    parent.abort();
    expect(signal.aborted).toBe(true);
  });
});
