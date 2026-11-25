/**
 * Tests for reading the ticket routes' input: the Report a fault form with and without a photo, the choices that
 * must come from the lists, and ids that aren't UUIDs.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import {
  CATEGORY_MESSAGE,
  WHERE_MESSAGE,
  isUuid,
  parseCategory,
  parsePlaceId,
  parseReportForm,
  requireTicketId,
} from '@/lib/ticketInput';
import { ME_TOO_ERRORS, REPORT_ERRORS } from '@/services/ticketService';

const PLACE = '5f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

/** A form with the given text fields. */
function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** Returns the AppError a call throws, or fails the test. */
async function errorFrom(run: () => unknown): Promise<AppError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('Expected an AppError');
}

describe('parseReportForm', () => {
  it('reads a flat report', async () => {
    await expect(
      parseReportForm(
        form({
          where: 'flat',
          category: 'Plumbing',
          title: 'Sink',
          description: 'Leaks',
          homeTimes: 'After 5 pm',
        }),
      ),
    ).resolves.toEqual({
      where: 'flat',
      placeId: null,
      category: 'Plumbing',
      title: 'Sink',
      description: 'Leaks',
      homeTimes: 'After 5 pm',
      photo: null,
      emergency: false,
    });
  });

  it('reads a common-area emergency with a place', async () => {
    const input = await parseReportForm(
      form({
        where: 'common',
        placeId: PLACE,
        category: 'Fire or gas smell',
        title: 'Gas smell',
        description: 'On the stairs',
        emergency: 'true',
      }),
    );
    expect(input).toMatchObject({ placeId: PLACE, emergency: true, homeTimes: null });
  });

  it('passes an empty title and description on, for the service to answer', async () => {
    const input = await parseReportForm(form({ where: 'flat', category: 'Other' }));
    expect(input).toMatchObject({ title: '', description: '' });
  });

  it('reads an attached photo as bytes with its type', async () => {
    const data = form({ where: 'flat', category: 'Plumbing', title: 'Sink', description: 'Leaks' });
    data.set(
      'photo',
      new File([new Uint8Array([0xff, 0xd8, 0xff])], 'p.jpg', { type: 'image/jpeg' }),
    );
    const input = await parseReportForm(data);
    expect(input.photo?.contentType).toBe('image/jpeg');
    expect([...(input.photo?.bytes ?? [])]).toEqual([0xff, 0xd8, 0xff]);
  });

  it('treats an empty file field as no photo', async () => {
    const data = form({ where: 'flat', category: 'Plumbing' });
    data.set('photo', new File([], 'empty.jpg', { type: 'image/jpeg' }));
    await expect(parseReportForm(data)).resolves.toMatchObject({ photo: null });
  });

  it.each<Record<string, string>>([{}, { where: 'roof' }])(
    'refuses a missing or unknown where: %j',
    async (fields) => {
      const error = await errorFrom(() =>
        parseReportForm(form({ category: 'Plumbing', ...fields })),
      );
      expect(error).toMatchObject({ status: 400, message: WHERE_MESSAGE });
    },
  );

  it('refuses a category that is not on the list', async () => {
    const error = await errorFrom(() => parseReportForm(form({ where: 'flat', category: 'Gas' })));
    expect(error).toMatchObject({ status: 400, message: CATEGORY_MESSAGE });
  });

  it.each(['', 'lift-1'])('refuses a common-area report with place %j', async (placeId) => {
    const error = await errorFrom(() =>
      parseReportForm(form({ where: 'common', category: 'Lift', placeId })),
    );
    expect(error).toMatchObject({ status: 400, message: REPORT_ERRORS.place });
  });

  it('refuses a flat report that names a place (TC-R02-13)', async () => {
    const error = await errorFrom(() =>
      parseReportForm(form({ where: 'flat', category: 'Lift', placeId: PLACE })),
    );
    expect(error).toMatchObject({ status: 400, message: REPORT_ERRORS.place });
  });
});

describe('ids and choices', () => {
  it('knows a UUID', () => {
    expect(isUuid(PLACE)).toBe(true);
    expect(isUuid('ticket-1')).toBe(false);
    expect(isUuid(42)).toBe(false);
  });

  it('returns a UUID ticket id, and 404 for anything else', async () => {
    expect(requireTicketId(PLACE)).toBe(PLACE);
    const error = await errorFrom(() => requireTicketId("1' or '1'='1"));
    expect(error).toMatchObject({ status: 404, message: ME_TOO_ERRORS.notFound });
  });

  it('reads a category and a place id', () => {
    expect(parseCategory('Water supply')).toBe('Water supply');
    expect(parsePlaceId(PLACE)).toBe(PLACE);
    expect(() => parseCategory(null)).toThrow(CATEGORY_MESSAGE);
    expect(() => parsePlaceId(undefined)).toThrow(REPORT_ERRORS.place);
  });
});
