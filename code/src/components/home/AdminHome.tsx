'use client';

/**
 * System administrator home (`/admin`, prototype `A-Setup.html`, read-only version, BB-0012): the building, its
 * blocks and flats, and the manager account (ADM-01). In Release 1 these are set up by the seed (feature 2), so the
 * page shows them and says so instead of offering the setup steps.
 *
 * @author Mahir Al Kamal
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Building2, CircleAlert, Info, Layers, UserRound } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { callApi } from '@/lib/apiClient';
import type { BuildingSetup } from '@/services/buildingSetupService';
import { plural } from './managerHomeView';

/** The setup: still loading, loaded, or the error to show. */
type Loaded =
  | { state: 'loading' }
  | { state: 'ready'; setup: BuildingSetup }
  | { state: 'error'; message: string };

/**
 * A block's name as people say it: the seed names blocks "A" and "B", shown as "Block A".
 * @param name - The stored name.
 * @returns The name with "Block" in front, unless it already starts with it.
 */
export function blockLabel(name: string): string {
  return /^block\b/i.test(name) ? name : `Block ${name}`;
}

/** A card with an icon and a heading. */
function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="gap-3 p-4">
      <h2 className="flex items-center gap-3 text-lg font-bold">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

/**
 * System administrator home.
 * @returns The page content.
 */
export function AdminHome() {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  useEffect(() => {
    void callApi<BuildingSetup>('/api/buildings', 'GET').then((answer) =>
      setLoaded(
        answer.ok
          ? { state: 'ready', setup: answer.data }
          : { state: 'error', message: answer.error.message },
      ),
    );
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="text-[1.375rem] font-bold">Building setup</h1>

      <Alert>
        <Info aria-hidden="true" />
        <AlertDescription>
          In Release 1 the building, its flats and the manager account were set up for you. The
          administrator can&apos;t open bills, payments, tickets or feedback.
        </AlertDescription>
      </Alert>

      {loaded.state === 'loading' && <p className="text-muted-foreground">Loading…</p>}
      {loaded.state === 'error' && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{loaded.message}</AlertDescription>
        </Alert>
      )}
      {loaded.state === 'ready' && <Setup setup={loaded.setup} />}
    </div>
  );
}

/** The loaded setup. */
function Setup({ setup }: { setup: BuildingSetup }) {
  return (
    <>
      <Section icon={<Building2 aria-hidden="true" />} title="Building">
        {setup.building ? (
          <p>
            <span className="block text-base font-semibold">{setup.building.name}</span>
            <span className="block text-sm text-muted-foreground">{setup.building.address}</span>
          </p>
        ) : (
          <p className="text-muted-foreground">No building set up yet.</p>
        )}
      </Section>

      <Section icon={<Layers aria-hidden="true" />} title="Blocks and flats">
        {setup.blocks.length === 0 ? (
          <p className="text-muted-foreground">No blocks yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {setup.blocks.map((block) => (
                <li
                  key={block.name}
                  className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2.5"
                >
                  <span className="text-base font-semibold">{blockLabel(block.name)}</span>
                  <span className="text-sm text-muted-foreground">
                    {plural(block.floors, 'floor')} · {plural(block.flats, 'flat')}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm font-semibold">
              {plural(setup.totalFlats, 'flat')} in {plural(setup.blocks.length, 'block')}
            </p>
          </>
        )}
      </Section>

      <Section icon={<UserRound aria-hidden="true" />} title="Manager account">
        {setup.managers.length === 0 ? (
          <p className="text-muted-foreground">No manager account yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {setup.managers.map((manager) => (
              <li
                key={manager.username}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block text-base font-semibold">{manager.displayName}</span>
                  <span className="block text-sm text-muted-foreground">
                    Username {manager.username}
                    {manager.active && manager.mustChangePassword
                      ? ' · must change the temporary password at first login'
                      : ''}
                  </span>
                </span>
                <Badge variant={manager.active ? 'ok' : 'mute'}>
                  {manager.active ? 'Active' : 'Deactivated'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
