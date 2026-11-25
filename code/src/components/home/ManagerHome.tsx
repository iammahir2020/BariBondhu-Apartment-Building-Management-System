'use client';

/**
 * Building manager home (`/manager`, prototype `M-Dashboard.html` and `M-Dashboard-Mobile.html`, short version,
 * BB-0010). BM-01 says the manager lands here after logging in. It shows what needs the manager now (late and
 * overdue tickets, overpayments to refund) and three totals: what is paid for the newest month, open tickets and
 * expenses waiting for the committee. A card links to its page only once that page exists (`MANAGER_PAGES`).
 *
 * @author Mahir Al Kamal
 */
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CircleAlert, Clock, Repeat, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { callApi } from '@/lib/apiClient';
import { formatTaka } from '@/lib/money';
import type { ManagerHomeSummary } from '@/services/managerHomeService';
import {
  billsTotal,
  MANAGER_PAGES,
  managerNeeds,
  ticketsLine,
  type Need,
  type NeedTone,
} from './managerHomeView';

/** The summary: still loading, loaded, or the error to show. */
type Loaded =
  | { state: 'loading' }
  | { state: 'ready'; summary: ManagerHomeSummary }
  | { state: 'error'; message: string };

const TONE_CLASS: Record<NeedTone, string> = {
  bad: 'bg-bad-bg text-bad',
  warn: 'bg-warn-bg text-warn',
  info: 'bg-info-bg text-info',
};

const TONE_ICON: Record<NeedTone, ReactNode> = {
  bad: <TriangleAlert aria-hidden="true" />,
  warn: <Clock aria-hidden="true" />,
  info: <Repeat aria-hidden="true" />,
};

/** A card that is a link when its page exists, and plain otherwise. */
function MaybeLink({
  href,
  className,
  children,
}: {
  href: string | null;
  className: string;
  children: ReactNode;
}) {
  if (href === null) return <div className={className}>{children}</div>;
  return (
    <Link href={href} className={`${className} hover:border-brand-600`}>
      {children}
    </Link>
  );
}

/** One "Needs you now" item. */
function NeedCard({ need }: { need: Need }) {
  return (
    <li>
      <MaybeLink
        href={need.href}
        className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card p-4"
      >
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-xl ${TONE_CLASS[need.tone]}`}
        >
          {TONE_ICON[need.tone]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold wrap-break-word">{need.title}</span>
          <span className="block text-sm text-muted-foreground">{need.detail}</span>
        </span>
      </MaybeLink>
    </li>
  );
}

/** One total, like "Open tickets 11". */
function Total({
  href,
  label,
  value,
  line,
}: {
  href: string | null;
  label: string;
  value: string;
  line: string;
}) {
  return (
    <li>
      <MaybeLink
        href={href}
        className="flex h-full min-h-16 flex-col gap-1 rounded-2xl border border-border bg-card p-4"
      >
        <span className="text-sm font-semibold text-muted-foreground">{label}</span>
        <span className="text-[1.625rem] font-bold wrap-break-word">{value}</span>
        <span className="text-sm text-muted-foreground">{line}</span>
      </MaybeLink>
    </li>
  );
}

/**
 * Building manager home.
 * @returns The page content.
 */
export function ManagerHome() {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  useEffect(() => {
    void callApi<ManagerHomeSummary>('/api/dashboards/manager', 'GET').then((answer) =>
      setLoaded(
        answer.ok
          ? { state: 'ready', summary: answer.data }
          : { state: 'error', message: answer.error.message },
      ),
    );
  }, []);

  return (
    <div className="flex w-full flex-col gap-5">
      <h1 className="text-[1.375rem] font-bold lg:sr-only">Dashboard</h1>

      {loaded.state === 'loading' && <p className="text-muted-foreground">Loading…</p>}

      {loaded.state === 'error' && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{loaded.message}</AlertDescription>
        </Alert>
      )}

      {loaded.state === 'ready' && <Summary summary={loaded.summary} />}
    </div>
  );
}

/** The loaded home: needs first, then the totals. */
function Summary({ summary }: { summary: ManagerHomeSummary }) {
  const needs = managerNeeds(summary);
  const bills = billsTotal(summary);
  return (
    <>
      <section className="flex flex-col gap-3" aria-labelledby="needs-heading">
        <h2 id="needs-heading" className="text-lg font-bold">
          Needs you now
        </h2>
        {needs.length === 0 ? (
          <Card className="p-4 text-muted-foreground">Nothing needs you right now.</Card>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {needs.map((need) => (
              <NeedCard key={need.title} need={need} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Totals">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Total href={MANAGER_PAGES.bills} {...bills} />
          <Total
            href={MANAGER_PAGES.tickets}
            label="Open tickets"
            value={String(summary.tickets.open)}
            line={ticketsLine(summary)}
          />
          <Total
            href={MANAGER_PAGES.expenses}
            label="Expenses waiting for committee"
            value={String(summary.waitingExpenses.count)}
            line={formatTaka(summary.waitingExpenses.totalPoisha)}
          />
        </ul>
      </section>
    </>
  );
}
