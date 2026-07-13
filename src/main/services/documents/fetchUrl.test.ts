import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchUrlText, isPrivateHost } from './fetchUrl';

// A minimal Response stand-in: fetchUrlText only touches ok/status/redirected/
// url/headers.get and async-iterates body.
function fakeResponse(over: Partial<Record<string, unknown>> & { body?: unknown } = {}) {
  return {
    ok: true,
    status: 200,
    redirected: false,
    url: 'https://example.com/job',
    headers: { get: (k: string) => (k === 'content-type' ? 'text/html' : null) },
    body: (async function* () {
      yield Buffer.from('<html><title>Role</title><p>We hire engineers.</p></html>');
    })(),
    ...over,
  } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('isPrivateHost', () => {
  it('flags loopback, RFC-1918, link-local (metadata), and local names', () => {
    for (const h of [
      'localhost',
      'api.localhost',
      'printer.local',
      '127.0.0.1',
      '10.1.2.3',
      '192.168.0.10',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.255',
      '::1',
      '[::1]',
      'fe80::1',
      'fd00::2',
    ]) {
      expect(isPrivateHost(h), h).toBe(true);
    }
  });
  it('passes public hosts', () => {
    for (const h of ['example.com', 'jobs.lever.co', '8.8.8.8', '172.15.0.1', '172.32.0.1']) {
      expect(isPrivateHost(h), h).toBe(false);
    }
  });
});

describe('fetchUrlText', () => {
  it('extracts title + text from an HTML page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse()));
    const { text, title } = await fetchUrlText('https://example.com/job');
    expect(title).toBe('Role');
    expect(text).toContain('We hire engineers.');
  });

  it('rejects non-http(s) schemes and unparseable URLs', async () => {
    await expect(fetchUrlText('file:///etc/passwd')).rejects.toThrow(/http\(s\)/);
    await expect(fetchUrlText('not a url')).rejects.toThrow(/valid URL/);
  });

  it('stops reading an endless body at the byte cap instead of buffering it all', async () => {
    let pulls = 0;
    const endless = (async function* () {
      const chunk = Buffer.alloc(1_000_000, 97); // 1 MB of "a" per pull, forever
      for (;;) {
        pulls++;
        yield chunk;
      }
    })();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ body: endless })));
    const { text } = await fetchUrlText('https://example.com/huge');
    expect(text.length).toBeGreaterThan(0);
    // MAX_BYTES is 3 MB — the reader must bail right at the cap, not drain the stream.
    expect(pulls).toBeLessThanOrEqual(4);
  });

  it('refuses a redirect that lands on a local/private address', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        fakeResponse({ redirected: true, url: 'http://127.0.0.1:8080/admin' }),
      ),
    );
    await expect(fetchUrlText('https://short.example/x')).rejects.toThrow(/local or private/);
  });

  it('still allows a redirect between public hosts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(fakeResponse({ redirected: true, url: 'https://boards.example.com/j/1' })),
    );
    const { title } = await fetchUrlText('https://short.example/x');
    expect(title).toBe('Role');
  });
});
