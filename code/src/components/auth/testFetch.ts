/**
 * A fake `fetch` for component tests. jsdom has no `fetch` or `Response`, so this returns only what `callApi`
 * reads: `ok`, `status` and `text()`. Only test files import this.
 *
 * @author Mahir Al Kamal
 */

/**
 * Makes every `fetch` answer with this status and JSON body.
 * @param status - HTTP status.
 * @param body - The JSON body.
 * @returns The mock, to check what was sent.
 */
export function answerFetch(status: number, body: unknown): jest.Mock {
  const mock = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }));
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

/** One canned answer for {@link answerFetchByRoute}. */
export interface FakeRoute {
  method: string;
  /** The request URL, or its start when it ends with `*` (for a query string or an id). */
  url: string;
  status: number;
  body: unknown;
}

/**
 * Makes `fetch` answer by method and URL, for screens that call more than one route. The last matching route wins,
 * so a test can add an answer to override an earlier one. Anything unmatched gets a 404.
 * @param routes - The answers.
 * @returns The mock, to check what was sent.
 */
export function answerFetchByRoute(routes: FakeRoute[]): jest.Mock {
  const mock = jest.fn(async (url: string, init?: { method?: string }) => {
    const method = init?.method ?? 'GET';
    const route = [...routes]
      .reverse()
      .find(
        (r) =>
          r.method === method &&
          (r.url.endsWith('*') ? url.startsWith(r.url.slice(0, -1)) : url === r.url),
      );
    const status = route?.status ?? 404;
    const body = route ? route.body : { error: { code: 'NOT_FOUND', message: 'No such route' } };
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

/**
 * Makes every `fetch` fail as if the network were down.
 * @returns The mock.
 */
export function failFetch(): jest.Mock {
  const mock = jest.fn(async () => Promise.reject(new TypeError('Failed to fetch')));
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}
