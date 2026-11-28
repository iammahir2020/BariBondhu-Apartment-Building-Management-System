'use client';

/**
 * Committee member home (`/committee`, prototype `C-Home.html` and `C-Home-Web.html`, short version, BB-0011). CM-05
 * says the committee member lands here after logging in. It shows the expenses waiting for their decision (CM-02)
 * and the current charge rates (CM-01), each linking to its page. The fund summary card comes with BB-1008; the rest
 * of the prototype (late tickets, feedback) is the committee dashboard, CM-04, which is not in Release 1. The
 * expenses and rates load on their own, so one failing doesn't hide the other.
 *
 * @author Mahir Al Kamal
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, CircleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { formatBillDay } from '@/components/payments/billView';
import { callApi } from '@/lib/apiClient';
import { formatTaka } from '@/lib/money';
import {
  CHARGE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  orderRates,
  waitingForDecision,
  type HomeExpense,
  type HomeRate,
  WAITING_SHOWN,
} from './committeeHomeView';
import { LoadingRows } from '@/components/Loading';

/** One list from the API: still loading, loaded, or the error to show. */
type Loaded<T> =
  { state: 'loading' } | { state: 'ready'; items: T[] } | { state: 'error'; message: string };

/** The fund summary fields the home shows. */
interface HomeFund {
  month: string;
  closingBalancePoisha: number;
  totalOutstandingPoisha: number;
}

const LOADING = { state: 'loading' } as const;

/**
 * Loads one list from a route.
 * @param url - The route.
 * @param key - The field of the response that holds the list.
 * @returns The list, or the error message.
 */
async function loadList<T>(url: string, key: string): Promise<Loaded<T>> {
  const answer = await callApi<Record<string, T[]>>(url, 'GET');
  if (!answer.ok) return { state: 'error', message: answer.error.message };
  return { state: 'ready', items: answer.data[key] ?? [] };
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

/** A section heading with a link to the full page. */
function SectionHead({
  id,
  title,
  href,
  link,
}: {
  id: string;
  title: string;
  href: string;
  link: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h2 id={id} className="text-lg font-bold">
        {title}
      </h2>
      <Link
        href={href}
        className="inline-flex min-h-12 items-center gap-1 text-sm font-semibold text-brand-700"
      >
        {link}
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

/** The expenses waiting for a decision. */
function WaitingSection({ expenses }: { expenses: Loaded<HomeExpense> }) {
  const waiting = expenses.state === 'ready' ? waitingForDecision(expenses.items) : null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="waiting-heading">
      <SectionHead
        id="waiting-heading"
        title="Waiting for your decision"
        href="/committee/expenses"
        link={waiting && waiting.count > WAITING_SHOWN ? `See all ${waiting.count}` : 'Expenses'}
      />
      {expenses.state === 'loading' && (
        <LoadingRows label="Loading expenses…" rows={1} card={false} />
      )}
      {expenses.state === 'error' && <ErrorNote message={expenses.message} />}
      {waiting && waiting.count === 0 && (
        <Card className="p-4 text-muted-foreground">Nothing is waiting for your decision.</Card>
      )}
      {waiting && waiting.count > 0 && (
        <Card className="gap-0 p-0">
          <ul className="divide-y divide-border">
            {waiting.shown.map((expense) => (
              <li key={expense.id}>
                <Link
                  href="/committee/expenses"
                  className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3.5"
                >
                  <span className="min-w-40 flex-1">
                    <span className="block text-base font-semibold wrap-break-word">
                      {expense.description}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {EXPENSE_CATEGORY_LABELS[expense.category]} ·{' '}
                      {formatBillDay(expense.expenseDate)}
                    </span>
                  </span>
                  <span className="text-base font-bold">{formatTaka(expense.amountPoisha)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

/** The current charge rates. */
function RatesSection({ rates }: { rates: Loaded<HomeRate> }) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="rates-heading">
      <SectionHead
        id="rates-heading"
        title="Charge rates"
        href="/committee/rates"
        link="Rates and history"
      />
      {rates.state === 'loading' && <LoadingRows label="Loading rates…" card={false} />}
      {rates.state === 'error' && <ErrorNote message={rates.message} />}
      {rates.state === 'ready' && rates.items.length === 0 && (
        <Card className="p-4 text-muted-foreground">No rates set yet.</Card>
      )}
      {rates.state === 'ready' && rates.items.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-3">
          {orderRates(rates.items).map((rate) => (
            <li
              key={rate.chargeType}
              className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4"
            >
              <span className="text-sm font-semibold text-muted-foreground">
                {CHARGE_LABELS[rate.chargeType]}
              </span>
              <span className="text-[1.375rem] font-bold">{formatTaka(rate.amountPoisha)}</span>
              <span className="text-sm text-muted-foreground">
                Since the meeting on {formatBillDay(rate.meetingDate)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The newest published month of the fund summary, totals only (CM-04, NFR-12). */
function FundSection({ funds }: { funds: Loaded<HomeFund> }) {
  const latest = funds.state === 'ready' ? funds.items[0] : undefined;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="fund-heading">
      <SectionHead
        id="fund-heading"
        title="Fund summary"
        href="/committee/fund"
        link="Fund summary"
      />
      {funds.state === 'loading' && <LoadingRows label="Loading the fund…" rows={1} card={false} />}
      {funds.state === 'error' && <ErrorNote message={funds.message} />}
      {funds.state === 'ready' && latest === undefined && (
        <Card className="p-4 text-muted-foreground">Not ready yet. No month is published.</Card>
      )}
      {latest !== undefined && (
        <Card className="gap-1 p-4">
          <span className="text-sm font-semibold text-muted-foreground">
            Closing balance, {latest.month.slice(0, 7)}
          </span>
          <span className="text-[1.375rem] font-bold">
            {formatTaka(latest.closingBalancePoisha)}
          </span>
          <span className="text-sm text-muted-foreground">
            Still owed by flats: {formatTaka(latest.totalOutstandingPoisha)} (total only)
          </span>
        </Card>
      )}
    </section>
  );
}
/**
 * Committee member home.
 * @returns The page content.
 */
export function CommitteeHome() {
  const [expenses, setExpenses] = useState<Loaded<HomeExpense>>(LOADING);
  const [rates, setRates] = useState<Loaded<HomeRate>>(LOADING);
  const [funds, setFunds] = useState<Loaded<HomeFund>>(LOADING);

  useEffect(() => {
    void loadList<HomeExpense>('/api/expenses', 'expenses').then(setExpenses);
    void loadList<HomeRate>('/api/rates', 'current').then(setRates);
    void loadList<HomeFund>('/api/fund-summary', 'summaries').then(setFunds);
  }, []);

  return (
    <div className="flex w-full flex-col gap-5">
      <h1 className="text-[1.375rem] font-bold lg:sr-only">Home</h1>
      <WaitingSection expenses={expenses} />
      <RatesSection rates={rates} />
      <FundSection funds={funds} />
    </div>
  );
}
