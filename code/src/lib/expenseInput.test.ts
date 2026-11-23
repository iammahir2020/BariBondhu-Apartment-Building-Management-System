/**
 * Tests for reading expense fields from a request body.
 *
 * @author Ayesha Siddiqa
 */
import { readExpenseInput } from '@/lib/expenseInput';

describe('readExpenseInput', () => {
  it('reads a complete body (normal)', () => {
    expect(
      readExpenseInput({
        amountPoisha: 250000,
        expenseDate: ' 2026-11-20 ',
        category: 'repair',
        description: 'Lift motor',
        receiptPhoto: 'receipts/lift.jpg',
      }),
    ).toEqual({
      amountPoisha: 250000,
      expenseDate: '2026-11-20',
      category: 'repair',
      description: 'Lift motor',
      receiptPhoto: 'receipts/lift.jpg',
    });
  });

  it('turns missing fields into null (invalid input)', () => {
    expect(readExpenseInput({})).toEqual({
      amountPoisha: null,
      expenseDate: null,
      category: null,
      description: null,
      receiptPhoto: null,
    });
  });

  it('turns fields of the wrong type or an unknown category into null (invalid input)', () => {
    const result = readExpenseInput({
      amountPoisha: '2500',
      expenseDate: 20261120,
      category: 'gas',
      description: 5,
    });
    expect(result).toMatchObject({
      amountPoisha: null,
      expenseDate: null,
      category: null,
      description: null,
    });
  });
});
