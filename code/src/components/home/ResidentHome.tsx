'use client';

/**
 * Resident home (`/resident`, prototype `R-Home.html` and `R-Home-Web.html`, BB-0612): the bill to pay with Pay now
 * and See bill (RES-01), the New guest pass and Report a fault tiles, and my household's latest guest pass (RES-03)
 * and ticket (RES-02), each opening its own page. Pay now goes straight to the checkout, so paying the current bill
 * takes two taps from home (NFR-24). The bill, passes and tickets load on their own, so one failing doesn't hide the
 * others.
 *
 * @author Mahir Al Kamal
 */
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleAlert, UserPlus, Wrench } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PASS_STATUS_BADGE } from '@/components/guestPasses/passView';
import {
  BILL_STATUS_BADGE,
  currentBill,
  dueCountdown,
  formatBillDay,
  formatBillMonth,
} from '@/components/payments/billView';
import { STATUS_BADGE, type MyTicketView } from '@/components/tickets/ticketView';
import { callApi } from '@/lib/apiClient';
import type { GuestPassView } from '@/lib/guestPassResponse';
import { formatTaka } from '@/lib/money';
import type { MyBillView } from '@/services/myBillsService';
import { homePass, homeTicket, passLine, passTitle, ticketLine } from './homeView';
import { LoadingRows } from '@/components/Loading';

/** One list from the API: still loading, loaded, or the error to show. */
type Loaded<T> =
  { state: 'loading' } | { state: 'ready'; items: T[] } | { state: 'error'; message: string };

const LOADING = { state: 'loading' } as const;

/**
 * Loads one list from a route into a {@link Loaded} value.
 * @param url - The route.
 * @param key - The field of the response that holds the list.
 * @returns The list, or the error message.
 */
async function loadList<T>(url: string, key: string): Promise<Loaded<T>> {
  const answer = await callApi<Record<string, T[]>>(url, 'GET');
  if (!answer.ok) return { state: 'error', message: answer.error.message };
  return { state: 'ready', items: answer.data[key] ?? [] };
}

/** The line under the bill's amount: the due date, and how long is left while it is Unpaid. */
function dueLine(bill: MyBillView, now: Date): string {
  const due = `Due ${formatBillDay(bill.dueDate)}`;
  if (bill.status === 'Payment pending') return `${due} · payment in progress`;
  if (bill.status === 'Awaiting verification') return `${due} · cash payment being checked`;
  return `${due} · ${dueCountdown(bill.dueDate, now)}`;
}

/** The dark bill card at the top of home. */
function BillCard({ bills }: { bills: Loaded<MyBillView> }) {
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (bills.state === 'loading') {
    return <LoadingRows label="Loading your bill…" rows={1} />;
  }
  if (bills.state === 'error') return <ErrorNote message={bills.message} />;

  const bill = currentBill(bills.items);
  if (!bill) {
    return (
      <Card className="flex-row flex-wrap items-center justify-between gap-3 p-4">
        <p className="font-medium">
          {bills.items.length === 0
            ? 'No bills yet.'
            : 'Nothing to pay. All your bills are settled.'}
        </p>
        <Button asChild variant="outline" className="min-h-12">
          <Link href="/resident/dues">See bills</Link>
        </Button>
      </Card>
    );
  }

  const badge = BILL_STATUS_BADGE[bill.status];
  const month = `${formatBillMonth(bill.billingMonth)} bill`;

  async function pay(id: string) {
    setPaying(true);
    setError(null);
    const answer = await callApi<{ checkoutUrl: string }>(`/api/bills/${id}/payments`, 'POST');
    if (answer.ok) {
      router.push(answer.data.checkoutUrl);
      return;
    }
    setPaying(false);
    setError(answer.error.message);
  }

  return (
    <section
      aria-label={month}
      className="flex flex-col gap-3.5 rounded-xl bg-brand-700 p-4 text-white"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-semibold text-brand-100">{month}</span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <div>
        <p className="text-3xl font-bold tabular-nums">{formatTaka(bill.totalPoisha)}</p>
        <p className="text-sm text-brand-100">{dueLine(bill, new Date())}</p>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-white px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2.5">
        {bill.canPay && (
          <Button
            className="min-h-12 flex-1 bg-white text-brand-900 hover:bg-brand-50"
            disabled={paying}
            onClick={() => void pay(bill.id)}
          >
            {paying ? 'Opening the gateway…' : 'Pay now'}
          </Button>
        )}
        <Button
          asChild
          variant="outline"
          className="min-h-12 flex-1 border-white/55 bg-transparent text-white hover:bg-white/10 hover:text-white"
        >
          <Link href="/resident/dues">See bill</Link>
        </Button>
      </div>
    </section>
  );
}

/** A tile linking to a page. */
function Tile({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-27 flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 font-semibold"
    >
      <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
        {icon}
      </span>
      {label}
    </Link>
  );
}

/** One row of the latest-things list. */
function Row({
  href,
  icon,
  iconClass,
  title,
  line,
  badge,
}: {
  href: string;
  icon: ReactNode;
  iconClass: string;
  title: string;
  line: string;
  badge: ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="flex min-h-16 items-center gap-3 px-4 py-3.5">
        <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${iconClass}`}>
          {icon}
        </span>
        {/* The badge drops under the text when there's no room beside it (360 px at 150% text). */}
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="min-w-28 flex-1">
            <span className="block font-semibold wrap-break-word">{title}</span>
            <span className="block text-sm text-muted-foreground">{line}</span>
          </span>
          {badge}
        </span>
      </Link>
    </li>
  );
}

/** A load failure, shown where its card would be. */
function ErrorNote({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/**
 * Resident home.
 * @returns The page content.
 */
export function ResidentHome() {
  const [bills, setBills] = useState<Loaded<MyBillView>>(LOADING);
  const [passes, setPasses] = useState<Loaded<GuestPassView>>(LOADING);
  const [tickets, setTickets] = useState<Loaded<MyTicketView>>(LOADING);

  useEffect(() => {
    void loadList<MyBillView>('/api/bills/mine', 'bills').then(setBills);
    void loadList<GuestPassView>('/api/guest-passes', 'passes').then(setPasses);
    void loadList<MyTicketView>('/api/tickets', 'tickets').then(setTickets);
  }, []);

  const pass = passes.state === 'ready' ? homePass(passes.items) : null;
  const ticket = tickets.state === 'ready' ? homeTicket(tickets.items) : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3.5">
      <h1 className="sr-only">Home</h1>

      <BillCard bills={bills} />

      <div className="grid grid-cols-2 gap-3">
        <Tile
          href="/resident/guest-passes"
          icon={<UserPlus aria-hidden="true" />}
          label="New guest pass"
        />
        <Tile
          href="/resident/report-fault"
          icon={<Wrench aria-hidden="true" />}
          label="Report a fault"
        />
      </div>

      {passes.state === 'error' && <ErrorNote message={passes.message} />}
      {tickets.state === 'error' && <ErrorNote message={tickets.message} />}

      {(pass || ticket) && (
        <Card className="gap-0 p-0">
          <ul className="divide-y divide-border" aria-label="Latest">
            {pass && (
              <Row
                href={`/resident/guest-passes/${pass.id}`}
                icon={<UserPlus aria-hidden="true" />}
                iconClass="bg-info-bg text-info"
                title={passTitle(pass)}
                line={passLine(pass)}
                badge={<Badge variant={PASS_STATUS_BADGE[pass.status]}>{pass.status}</Badge>}
              />
            )}
            {ticket && (
              <Row
                href="/resident/tickets"
                icon={<Wrench aria-hidden="true" />}
                iconClass="bg-warn-bg text-warn"
                title={ticket.ticket.title ?? 'Fault'}
                line={ticketLine(ticket)}
                badge={
                  <Badge variant={STATUS_BADGE[ticket.ticket.status]}>{ticket.ticket.status}</Badge>
                }
              />
            )}
          </ul>
        </Card>
      )}
    </div>
  );
}
