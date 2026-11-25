/**
 * Tests for the gateway's signed message (RES-01, BR-02): signing, checking the signature and reading the body.
 *
 * @author Mahir Al Kamal
 */
import { AppError } from '@/lib/errors';
import {
  GATEWAY_MESSAGE_ERRORS,
  isValidGatewaySignature,
  parseGatewayMessage,
  signGatewayMessage,
} from '@/services/gatewayMessage';

const SECRET = 'test-gateway-secret';
const BODY = JSON.stringify({
  transactionId: 'SIM-1A2B3C4D5E6F',
  reference: 'payment-1',
  amountPoisha: 350_000,
  state: 'Succeeded',
  reason: null,
});

describe('signGatewayMessage', () => {
  it('signs the body as 64 hexadecimal characters, the same each time', () => {
    const signature = signGatewayMessage(BODY, SECRET);

    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(signGatewayMessage(BODY, SECRET)).toBe(signature);
  });

  it('gives a different signature for another body or another secret', () => {
    const signature = signGatewayMessage(BODY, SECRET);

    expect(signGatewayMessage(`${BODY} `, SECRET)).not.toBe(signature);
    expect(signGatewayMessage(BODY, 'another-secret')).not.toBe(signature);
  });

  it('refuses to sign without a secret', () => {
    expect(() => signGatewayMessage(BODY, '')).toThrow('The gateway secret is not set.');
  });
});

describe('isValidGatewaySignature', () => {
  it('accepts the signature of the exact body, in either letter case', () => {
    const signature = signGatewayMessage(BODY, SECRET);

    expect(isValidGatewaySignature(BODY, signature, SECRET)).toBe(true);
    expect(isValidGatewaySignature(BODY, signature.toUpperCase(), SECRET)).toBe(true);
  });

  it('refuses a changed body, so the amount or state cannot be edited on the way (TC-R01-10)', () => {
    const signature = signGatewayMessage(BODY, SECRET);
    const edited = BODY.replace('350000', '1');

    expect(isValidGatewaySignature(edited, signature, SECRET)).toBe(false);
  });

  const valid = signGatewayMessage(BODY, SECRET);
  const oneOff = `${valid.slice(0, 63)}${valid.endsWith('0') ? '1' : '0'}`;
  it.each([
    ['missing', null],
    ['empty', ''],
    ['too short', 'ab12'],
    ['not hexadecimal', 'z'.repeat(64)],
    ['one character off', oneOff],
  ])('refuses a %s signature (TC-R01-10)', (_label, signature) => {
    expect(isValidGatewaySignature(BODY, signature, SECRET)).toBe(false);
  });

  it('refuses a signature made with another secret', () => {
    expect(isValidGatewaySignature(BODY, signGatewayMessage(BODY, 'another-secret'), SECRET)).toBe(
      false,
    );
  });

  it('refuses everything when the secret is not set', () => {
    expect(isValidGatewaySignature(BODY, signGatewayMessage(BODY, SECRET), '')).toBe(false);
  });
});

describe('parseGatewayMessage', () => {
  it('reads a confirmation', () => {
    expect(parseGatewayMessage(BODY)).toEqual({
      transactionId: 'SIM-1A2B3C4D5E6F',
      reference: 'payment-1',
      amountPoisha: 350_000,
      state: 'Succeeded',
      reason: null,
    });
  });

  it('reads a failure with its reason', () => {
    const body = JSON.stringify({
      transactionId: 'SIM-1',
      reference: 'payment-1',
      amountPoisha: 350_000,
      state: 'Failed',
      reason: 'The payment was declined.',
    });

    expect(parseGatewayMessage(body).reason).toBe('The payment was declined.');
  });

  const valid = JSON.parse(BODY) as Record<string, unknown>;
  it.each([
    ['not JSON', '{transactionId:'],
    ['JSON null', 'null'],
    ['a JSON number', '42'],
    ['no transaction id', JSON.stringify({ ...valid, transactionId: undefined })],
    ['an empty transaction id', JSON.stringify({ ...valid, transactionId: '' })],
    ['a reference that is not text', JSON.stringify({ ...valid, reference: 7 })],
    ['an amount as text', JSON.stringify({ ...valid, amountPoisha: '350000' })],
    ['an amount with a fraction', JSON.stringify({ ...valid, amountPoisha: 350_000.5 })],
    ['an unknown state', JSON.stringify({ ...valid, state: 'Paid' })],
    ['a reason that is a number', JSON.stringify({ ...valid, reason: 3 })],
  ])('refuses %s', (_label, body) => {
    let caught: unknown;
    try {
      parseGatewayMessage(body);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).status).toBe(400);
    expect((caught as AppError).message).toBe(GATEWAY_MESSAGE_ERRORS.body);
  });
});
