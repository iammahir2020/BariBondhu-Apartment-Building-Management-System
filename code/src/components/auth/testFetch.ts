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

/**
 * Makes every `fetch` fail as if the network were down.
 * @returns The mock.
 */
export function failFetch(): jest.Mock {
  const mock = jest.fn(async () => Promise.reject(new TypeError('Failed to fetch')));
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}
