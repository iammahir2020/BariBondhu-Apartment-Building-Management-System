'use client';

/**
 * My household's guest passes, under the New guest pass form (RES-03). Passes that can still let guests in come
 * first, so the resident finds today's code without scrolling; the rest are kept below as a short history. Each row
 * opens the pass with its code, QR and Cancel.
 *
 * @author Mahir Al Kamal
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { passLine, passTitle } from '@/components/home/homeView';
import { canCancelPass, PASS_STATUS_BADGE } from '@/components/guestPasses/passView';
import { LoadingRows } from '@/components/Loading';
import { callApi } from '@/lib/apiClient';
import type { GuestPassView } from '@/lib/guestPassResponse';

/** How many finished passes the Earlier list shows. */
export const EARLIER_LIMIT = 10;

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; passes: GuestPassView[] };

/** One pass as a tappable row. */
function PassRow({ pass }: { pass: GuestPassView }) {
  return (
    <li>
      <Link
        href={`/resident/guest-passes/${pass.id}`}
        className="flex min-h-16 items-center gap-3 px-4 py-3.5"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-info-bg text-info">
          <UserPlus aria-hidden="true" />
        </span>
        {/* The badge drops under the text when there's no room beside it (360 px at 150% text). */}
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="min-w-28 flex-1">
            <span className="block font-semibold wrap-break-word">{passTitle(pass)}</span>
            <span className="block text-sm text-muted-foreground">{passLine(pass)}</span>
          </span>
          <Badge variant={PASS_STATUS_BADGE[pass.status]}>{pass.status}</Badge>
        </span>
      </Link>
    </li>
  );
}

/** A titled group of passes, left out when it has none. */
function PassGroup({ title, passes }: { title: string; passes: readonly GuestPassView[] }) {
  if (passes.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <Card className="gap-0 p-0">
        <ul className="divide-y divide-border">
          {passes.map((pass) => (
            <PassRow key={pass.id} pass={pass} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

/**
 * The resident's passes: open and upcoming ones first, then up to {@link EARLIER_LIMIT} earlier ones.
 * @returns The Your passes section.
 */
export function MyGuestPassList() {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  useEffect(() => {
    void callApi<{ passes: GuestPassView[] }>('/api/guest-passes', 'GET').then((result) =>
      setLoaded(
        result.ok
          ? { state: 'ready', passes: result.data.passes }
          : { state: 'error', message: result.error.message },
      ),
    );
  }, []);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="my-passes-heading">
      <h2 id="my-passes-heading" className="text-lg font-semibold">
        Your passes
      </h2>
      {loaded.state === 'loading' && <LoadingRows label="Loading your passes…" rows={2} />}
      {loaded.state === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {loaded.message}
        </p>
      )}
      {loaded.state === 'ready' && loaded.passes.length === 0 && (
        <p className="text-sm text-muted-foreground">No passes yet. The ones you make show here.</p>
      )}
      {loaded.state === 'ready' && (
        <>
          <PassGroup
            title="Open and coming up"
            passes={loaded.passes.filter((pass) => canCancelPass(pass.status))}
          />
          <PassGroup
            title="Earlier"
            passes={loaded.passes
              .filter((pass) => !canCancelPass(pass.status))
              .slice(0, EARLIER_LIMIT)}
          />
        </>
      )}
    </section>
  );
}
