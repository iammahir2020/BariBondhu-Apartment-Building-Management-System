/**
 * Tests for the shared error shape every API route returns, and for reading request bodies in routes.
 *
 * @author Mahir Al Kamal
 */
import { AppError, INTERNAL_ERROR_MESSAGE, toErrorResponse } from '@/lib/errors';
import { readJsonObject, requireString } from '@/lib/parse';

describe('toErrorResponse', () => {
  it('keeps an AppError code, message, status and details (normal)', async () => {
    const response = toErrorResponse(
      new AppError('TOO_MANY_REQUESTS', 'Too many wrong passwords.', { retryAfterSeconds: 840 }),
    );
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many wrong passwords.',
        details: { retryAfterSeconds: 840 },
      },
    });
  });

  it('leaves out details when there are none', async () => {
    const response = toErrorResponse(new AppError('FORBIDDEN', 'No.'));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'FORBIDDEN', message: 'No.' },
    });
  });

  it('hides anything else behind a plain 500 (exception)', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = toErrorResponse(new Error('database password is wrong'));
    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toEqual({ error: { code: 'INTERNAL', message: INTERNAL_ERROR_MESSAGE } });
    expect(JSON.stringify(body)).not.toContain('database');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('readJsonObject', () => {
  const post = (body: string) => new Request('http://x/api', { method: 'POST', body });

  it('returns the fields of a JSON object (normal)', async () => {
    await expect(readJsonObject(post('{"a":1}'))).resolves.toEqual({ a: 1 });
  });

  it.each(['not json', '[1,2]', 'null', '"text"'])(
    'refuses %s with 400 (invalid input)',
    async (body) => {
      await expect(readJsonObject(post(body))).rejects.toMatchObject({ status: 400 });
    },
  );
});

describe('requireString', () => {
  it('trims by default and keeps spaces when asked', () => {
    expect(requireString({ u: '  bb-a  ' }, 'u', 'username')).toBe('bb-a');
    expect(requireString({ p: ' pass ' }, 'p', 'password', { trim: false })).toBe(' pass ');
  });

  it.each([{}, { u: '' }, { u: '   ' }, { u: 42 }])(
    'refuses %o with "Enter your username." (invalid input)',
    (body) => {
      expect(() => requireString(body, 'u', 'username')).toThrow('Enter your username.');
    },
  );
});
