/**
 * Times for the New guest pass form (prototype `R-GuestPass-New.html`, RES-03): the two quick choices, "Today, next
 * 6 hours" and "This evening", and the conversions to and from the From and Until boxes. The boxes are
 * `datetime-local` inputs, which hold the phone's local time with no time zone, so the conversions use local time
 * too. The rules (at most 24 hours, the end still ahead) are checked by the API, not here.
 *
 * @author Mahir Al Kamal
 */

/** The quick choices above the From and Until boxes; "pick" means the resident typed the times. */
export type PassWindowChoice = 'next6' | 'evening' | 'pick';

/** Labels of the choices, as in the prototype. */
export const PASS_WINDOW_LABELS: Readonly<Record<PassWindowChoice, string>> = {
  next6: 'Today, next 6 hours',
  evening: 'This evening',
  pick: 'Pick times',
};

/** A visit window as the two boxes hold it, `YYYY-MM-DDTHH:mm` in local time. */
export interface PassWindowInputs {
  from: string;
  until: string;
}

/** "This evening" runs from 6 pm to 11 pm. */
const EVENING_START_HOUR = 18;
const EVENING_END_HOUR = 23;

const HOUR = 60 * 60 * 1000;

/** Two digits, with a leading zero. */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * A time as a `datetime-local` box shows it, in local time, to the minute.
 * @param date - The time.
 * @returns For example `2026-11-25T18:00`.
 */
export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * What a `datetime-local` box holds, as an ISO time for the API.
 * @param value - The box's value, in local time.
 * @returns The ISO time, or '' when the box is empty or holds no real time, so the API answers "Check the visit
 *   times".
 */
export function fromLocalInput(value: string): string {
  if (value === '') return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/**
 * The From and Until times of a quick choice.
 * - "Today, next 6 hours": from now, to the minute, until 6 hours later.
 * - "This evening": 6 pm to 11 pm today; from now if 6 pm has passed; tomorrow evening once 11 pm has passed.
 * @param choice - `next6` or `evening`.
 * @param now - The current time.
 * @returns The two boxes' values.
 */
export function presetWindow(
  choice: Exclude<PassWindowChoice, 'pick'>,
  now: Date,
): PassWindowInputs {
  const start = new Date(now);
  start.setSeconds(0, 0);
  if (choice === 'next6') {
    return { from: toLocalInput(start), until: toLocalInput(new Date(start.getTime() + 6 * HOUR)) };
  }

  const eveningStart = new Date(start);
  eveningStart.setHours(EVENING_START_HOUR, 0, 0, 0);
  const eveningEnd = new Date(start);
  eveningEnd.setHours(EVENING_END_HOUR, 0, 0, 0);
  if (start >= eveningEnd) {
    eveningStart.setDate(eveningStart.getDate() + 1);
    eveningEnd.setDate(eveningEnd.getDate() + 1);
  }
  const from = start > eveningStart ? start : eveningStart;
  return { from: toLocalInput(from), until: toLocalInput(eveningEnd) };
}
