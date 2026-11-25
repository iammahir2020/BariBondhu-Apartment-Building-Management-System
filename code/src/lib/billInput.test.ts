/**
 * Tests for reading a bill id from the URL.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import { requireBillId } from '@/lib/billInput';
import { MY_BILL_ERRORS } from '@/services/myBillsService';

describe('requireBillId', () => {
  it.each(['0b9c6d1e-2f3a-4b5c-8d7e-9f0a1b2c3d4e', '0B9C6D1E-2F3A-4B5C-8D7E-9F0A1B2C3D4E'])(
    'passes the UUID %s through',
    (id) => {
      expect(requireBillId(id)).toBe(id);
    },
  );

  it.each(['', 'bill-1', '0b9c6d1e-2f3a-4b5c-8d7e-9f0a1b2c3d4', "1' or '1'='1"])(
    'answers %p as a missing bill',
    (id) => {
      let caught: unknown;
      try {
        requireBillId(id);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(AppError);
      expect((caught as AppError).status).toBe(404);
      expect((caught as AppError).message).toBe(MY_BILL_ERRORS.notFound);
    },
  );
});
