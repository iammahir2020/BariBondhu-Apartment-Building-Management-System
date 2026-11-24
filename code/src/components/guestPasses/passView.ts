/**
 * How the resident's guest pass screens (RES-03) show a pass: the badge colour for each status, the visit window
 * and the code in Dhaka time, and the message that Share sends. Passes arrive as {@link GuestPassView}, with times
 * as ISO strings.
 *
 * @author Mahir Al Kamal
 */
import type { GuestPassView } from '@/lib/guestPassResponse';
import type { GuestPassStatus } from '@/services/guestPassStatus';

/** The badge variants a status can use. */
export type PassBadgeVariant = 'info' | 'ok' | 'mute';

/** Badge colour per status: still to come in blue, open in green, finished in grey. */
export const PASS_STATUS_BADGE: Readonly<Record<GuestPassStatus, PassBadgeVariant>> = {
  Scheduled: 'info',
  Active: 'ok',
  'Partly used': 'info',
  'Fully used': 'mute',
  Cancelled: 'mute',
  Expired: 'mute',
};

/** Statuses the resident can still cancel, and whose code still lets guests in later. */
const LIVE: readonly GuestPassStatus[] = ['Scheduled', 'Active', 'Partly used'];

/**
 * Whether the pass can still be cancelled (RES-03 c4).
 * @param status - The pass's status now.
 * @returns `true` for Scheduled, Active and Partly used.
 */
export function canCancelPass(status: GuestPassStatus): boolean {
  return LIVE.includes(status);
}

/** The building's time zone: every time on the screens is Dhaka time. */
const ZONE = 'Asia/Dhaka';

/** "25 Nov" in Dhaka. */
function day(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: ZONE });
}

/** "5:00 pm" in Dhaka. */
function time(date: Date): string {
  return date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ZONE })
    .toLowerCase();
}

/**
 * One moment for reading, in Dhaka time.
 * @param iso - An ISO time.
 * @returns For example "25 Nov, 11:00 pm".
 */
export function formatPassMoment(iso: string): string {
  const date = new Date(iso);
  return `${day(date)}, ${time(date)}`;
}

/**
 * The visit window for reading. The end leaves out its day when it is the same day as the start.
 * @param startsAt - ISO start.
 * @param endsAt - ISO end.
 * @returns For example "25 Nov, 5:00 pm to 11:00 pm", or "25 Nov, 10:00 pm to 26 Nov, 2:00 am".
 */
export function formatPassWindow(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const until = day(start) === day(end) ? time(end) : `${day(end)}, ${time(end)}`;
  return `${day(start)}, ${time(start)} to ${until}`;
}

/**
 * The code split in two, as the prototype shows it, so it is easy to read out.
 * @param code - The 6-digit code.
 * @returns For example "482 913".
 */
export function formatPassCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/**
 * How many people the pass is for, in words.
 * @param count - The number of guests.
 * @returns "1 person" or "4 people".
 */
export function peopleText(count: number): string {
  return count === 1 ? '1 person' : `${count} people`;
}

/**
 * The message Share sends to the guest: who, how many, when, and the code to show at the gate.
 * @param pass - The pass.
 * @returns The text.
 */
export function passShareText(pass: GuestPassView): string {
  return (
    `Guest pass for ${pass.guestName}, ${peopleText(pass.guestCount)}, ` +
    `${formatPassWindow(pass.startsAt, pass.endsAt)}. ` +
    `Show code ${formatPassCode(pass.code)} to the guard at the gate.`
  );
}
