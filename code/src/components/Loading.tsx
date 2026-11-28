'use client';

/**
 * What a part of a page shows while its data loads, so every page loads the same way as the between-page placeholder
 * (`PageLoading`):
 *
 * - {@link LoadingRows}: grey rows shaped like a list, for lists, tables and cards of items.
 * - {@link LoadingBlock}: a title, a few lines and a card, for one record (a ticket, a pass, a receipt).
 * - {@link LoadingLine}: one short bar in place of a single value.
 * - {@link LoadingInline}: a small spinner with its text, for small spots where a grey shape would look odd.
 *
 * Each is a polite status region whose text screen readers announce; the shapes are hidden from them. The pulse and
 * the spin stop for people who turn motion off. After {@link SLOW_AFTER_MS} the rows and block add "Still loading…",
 * so a slow connection doesn't look frozen.
 *
 * @author Mahir Al Kamal
 */
import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';

/** How long before a loading placeholder adds "Still loading…". */
export const SLOW_AFTER_MS = 5000;

/** Widths for the rows' text bars, so the rows don't all look the same. */
const BAR_WIDTHS = ['w-3/5', 'w-2/5', 'w-1/2', 'w-2/3', 'w-1/3'] as const;

/**
 * Whether the placeholder has been showing longer than {@link SLOW_AFTER_MS}.
 * @returns `true` once the time has passed.
 */
function useSlow(): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return slow;
}

/** The "Still loading…" note under a slow placeholder. */
function SlowNote() {
  return <p className="mt-2 text-sm text-muted-foreground">Still loading…</p>;
}

/** Props for {@link LoadingRows}. */
export interface LoadingRowsProps {
  /** What screen readers hear, like "Loading tickets…". */
  label?: string;
  /** How many rows to show. */
  rows?: number;
  /** Draw the rows inside their own card. Leave off when the rows already sit in a card or table. */
  card?: boolean;
}

/**
 * Grey rows shaped like a list of items: an icon, two lines of text and a status badge.
 * @param props - The label, the number of rows and whether to draw a card.
 * @returns The placeholder rows.
 */
export function LoadingRows({ label = 'Loading…', rows = 3, card = true }: LoadingRowsProps) {
  const slow = useSlow();
  return (
    <div role="status" aria-live="polite" className="w-full">
      <span className="sr-only">{label}</span>
      <ul
        aria-hidden="true"
        className={`divide-y divide-border motion-safe:animate-pulse ${
          card ? 'rounded-[20px] border border-border bg-card' : ''
        }`}
      >
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex min-h-16 items-center gap-3 px-4 py-3.5">
            <span className="size-11 shrink-0 rounded-xl bg-muted" />
            <span className="flex flex-1 flex-col gap-2">
              <span className={`h-4 rounded bg-muted ${BAR_WIDTHS[i % BAR_WIDTHS.length]}`} />
              <span className={`h-3 rounded bg-muted ${BAR_WIDTHS[(i + 2) % BAR_WIDTHS.length]}`} />
            </span>
            <span className="h-6 w-16 shrink-0 rounded-full bg-muted" />
          </li>
        ))}
      </ul>
      {slow && <SlowNote />}
    </div>
  );
}

/**
 * A placeholder for one record: a title bar, a few lines of text and a card.
 * @param props - What screen readers hear, like "Loading ticket details…".
 * @returns The placeholder block.
 */
export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  const slow = useSlow();
  return (
    <div role="status" aria-live="polite" className="w-full">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="flex flex-col gap-3 motion-safe:animate-pulse">
        <div className="h-7 w-48 max-w-full rounded-lg bg-muted" />
        <div className="h-4 w-full max-w-md rounded bg-muted" />
        <div className="h-4 w-2/3 max-w-sm rounded bg-muted" />
        <div className="h-32 w-full rounded-[20px] bg-muted" />
      </div>
      {slow && <SlowNote />}
    </div>
  );
}

/**
 * One short grey bar in place of a single value, like a charge's current rate.
 * @param props - What screen readers hear.
 * @returns The placeholder bar.
 */
export function LoadingLine({ label = 'Loading…' }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" className="inline-block align-middle">
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className="block h-3.5 w-32 rounded bg-muted motion-safe:animate-pulse"
      />
    </span>
  );
}

/**
 * A small spinner with its text, for small spots like a photo or a short list of numbers.
 * @param props - The text shown next to the spinner.
 * @returns The spinner and text.
 */
export function LoadingInline({ label = 'Loading…' }: { label?: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <LoaderCircle aria-hidden="true" className="size-4 shrink-0 motion-safe:animate-spin" />
      {label}
    </p>
  );
}
