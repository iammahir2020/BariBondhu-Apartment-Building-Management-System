/**
 * Tests for the New guest pass form's times: the quick choices around 6 pm and 11 pm, and the conversions for the
 * `datetime-local` boxes. Times are built in local time, as the boxes hold them.
 *
 * @author Mahir Al Kamal
 */
import { fromLocalInput, presetWindow, toLocalInput } from '@/components/guestPasses/passTimes';

/** A local time on 25 Nov 2026. */
function at(hours: number, minutes = 0, seconds = 0, day = 25): Date {
  return new Date(2026, 10, day, hours, minutes, seconds);
}

describe('toLocalInput', () => {
  it('writes a local time to the minute, with leading zeros', () => {
    expect(toLocalInput(new Date(2026, 0, 5, 7, 3, 59))).toBe('2026-01-05T07:03');
  });
});

describe('fromLocalInput', () => {
  it('reads a box back as the same moment', () => {
    expect(fromLocalInput('2026-11-25T18:30')).toBe(at(18, 30).toISOString());
  });

  it("gives '' for an empty box", () => {
    expect(fromLocalInput('')).toBe('');
  });

  it("gives '' for a value that is no real time", () => {
    expect(fromLocalInput('tomorrow evening')).toBe('');
  });
});

describe('presetWindow: today, next 6 hours', () => {
  it('runs from now, to the minute, until 6 hours later', () => {
    expect(presetWindow('next6', at(14, 20, 45))).toEqual({
      from: '2026-11-25T14:20',
      until: '2026-11-25T20:20',
    });
  });

  it('runs past midnight late in the evening', () => {
    expect(presetWindow('next6', at(21, 0))).toEqual({
      from: '2026-11-25T21:00',
      until: '2026-11-26T03:00',
    });
  });
});

describe('presetWindow: this evening', () => {
  it('runs from 6 pm to 11 pm before 6 pm', () => {
    expect(presetWindow('evening', at(10, 0))).toEqual({
      from: '2026-11-25T18:00',
      until: '2026-11-25T23:00',
    });
  });

  it('starts at 6 pm exactly at 6 pm', () => {
    expect(presetWindow('evening', at(18, 0))).toEqual({
      from: '2026-11-25T18:00',
      until: '2026-11-25T23:00',
    });
  });

  it('starts now once 6 pm has passed', () => {
    expect(presetWindow('evening', at(19, 15, 30))).toEqual({
      from: '2026-11-25T19:15',
      until: '2026-11-25T23:00',
    });
  });

  it('moves to tomorrow evening once 11 pm has come', () => {
    expect(presetWindow('evening', at(23, 0))).toEqual({
      from: '2026-11-26T18:00',
      until: '2026-11-26T23:00',
    });
  });

  it('moves across the end of a month', () => {
    expect(presetWindow('evening', new Date(2026, 10, 30, 23, 30))).toEqual({
      from: '2026-12-01T18:00',
      until: '2026-12-01T23:00',
    });
  });
});
