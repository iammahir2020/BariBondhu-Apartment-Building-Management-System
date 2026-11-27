'use client';

/**
 * Manager's seven-day guard shift planner (BB-1907, BM-09).
 *
 * @author Tawhid Bin Moslim
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { callApi } from '@/lib/apiClient';
import type { ShiftStatus } from '@/models/Shift';

interface ShiftJson {
  id: string;
  guardId: string;
  startsAt: string;
  endsAt: string;
  status: ShiftStatus;
}

interface DutyGapJson {
  startsAt: string;
  endsAt: string;
}

interface ManagerDutyListResponse {
  startsAt: string;
  endsAt: string;
  shifts: ShiftJson[];
  gaps: DutyGapJson[];
}

interface GuardOption {
  id: string;
  displayName: string;
}

interface GuardsResponse {
  guards: GuardOption[];
}

/** Formats a timestamp using Dhaka time. */
function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Formats the seven-day window dates. */
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Converts a datetime-local value interpreted as Dhaka time to ISO.
 */
function dhakaDateTimeToISO(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    throw new Error('Check the shift times');
  }

  const [, year, month, day, hour, minute] = match;

  const timestamp =
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) -
    6 * 60 * 60 * 1000;

  return new Date(timestamp).toISOString();
}

export function ManagerShifts() {
  const [duty, setDuty] = useState<ManagerDutyListResponse | null>(null);
  const [guards, setGuards] = useState<GuardOption[]>([]);
  const [guardId, setGuardId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setListError(null);

    const [dutyResult, guardsResult] = await Promise.all([
      callApi<ManagerDutyListResponse>('/api/manager/shifts', 'GET'),
      callApi<GuardsResponse>('/api/manager/shifts/guards', 'GET'),
    ]);

    if (!dutyResult.ok) {
      setListError(dutyResult.error.message);
    } else {
      setDuty(dutyResult.data);
    }

    if (!guardsResult.ok) {
      setListError((current) => current ?? guardsResult.error.message);
    } else {
      setGuards(guardsResult.data.guards);
      setGuardId((current) => current || guardsResult.data.guards[0]?.id || '');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!guardId || !startsAt || !endsAt) {
      setFormError('Please select a guard and enter both shift times.');
      return;
    }

    let startISO: string;
    let endISO: string;

    try {
      startISO = dhakaDateTimeToISO(startsAt);
      endISO = dhakaDateTimeToISO(endsAt);
    } catch {
      setFormError('Check the shift times');
      return;
    }

    setSaving(true);

    const result = await callApi<{ shift: ShiftJson }>('/api/manager/shifts', 'POST', {
      guardId,
      startsAt: startISO,
      endsAt: endISO,
    });

    if (!result.ok) {
      setFormError(result.error.message);
      setSaving(false);
      return;
    }

    setSuccess('Shift saved successfully.');
    setStartsAt('');
    setEndsAt('');

    await loadData();
    setSaving(false);
  };

  const guardName = (id: string) =>
    guards.find((guard) => guard.id === id)?.displayName ?? 'Unknown guard';

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Guard shifts</h1>
        <p className="text-sm text-muted-foreground">
          Plan and view guard duty for the next seven days.
        </p>
      </header>

      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading guard shifts...
        </p>
      )}

      {listError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
        >
          {listError}
          <button type="button" onClick={() => void loadData()} className="ml-3 underline">
            Try again
          </button>
        </div>
      )}

      {duty && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Next 7 days</h2>
              <p className="text-sm text-muted-foreground">
                {formatDate(duty.startsAt)} - {formatDate(duty.endsAt)}
              </p>
            </div>

            <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
              {duty.gaps.length} {duty.gaps.length === 1 ? 'gap' : 'gaps'}
            </span>
          </div>

          {duty.gaps.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold">Uncovered duty periods</h3>

              {duty.gaps.map((gap, index) => (
                <div
                  key={`${gap.startsAt}-${index}`}
                  className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4"
                >
                  <p className="font-medium text-amber-700 dark:text-amber-400">No guard planned</p>
                  <p className="mt-1 text-sm">
                    {formatDateTime(gap.startsAt)} - {formatDateTime(gap.endsAt)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {duty.gaps.length === 0 && (
            <p className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 text-sm">
              All duty periods are covered in the next seven days.
            </p>
          )}

          <div className="space-y-3">
            <h3 className="font-semibold">Assigned shifts</h3>

            {duty.shifts.length === 0 ? (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                No shifts planned for this period.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {duty.shifts.map((shift) => (
                  <article key={shift.id} className="rounded-lg border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-semibold">{guardName(shift.guardId)}</h4>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
                        {shift.status}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                      <p>Starts: {formatDateTime(shift.startsAt)}</p>
                      <p>Ends: {formatDateTime(shift.endsAt)}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-card p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Add a shift</h2>
          <p className="text-sm text-muted-foreground">
            Assign a guard to a duty period. Times use Bangladesh time.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="shift-guard" className="text-sm font-medium">
              Guard
            </label>
            <select
              id="shift-guard"
              value={guardId}
              onChange={(event) => setGuardId(event.target.value)}
              disabled={loading || saving || guards.length === 0}
              required
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">Select a guard</option>
              {guards.map((guard) => (
                <option key={guard.id} value={guard.id}>
                  {guard.displayName}
                </option>
              ))}
            </select>
            {guards.length === 0 && !loading && (
              <p className="text-xs text-muted-foreground">No active guards are available.</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="shift-start" className="text-sm font-medium">
                Starts
              </label>
              <input
                id="shift-start"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                disabled={saving}
                required
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="shift-end" className="text-sm font-medium">
                Ends
              </label>
              <input
                id="shift-end"
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                disabled={saving}
                required
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}

          {success && (
            <p role="status" className="text-sm text-green-700 dark:text-green-400">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || loading || guards.length === 0}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save shift'}
          </button>
        </form>
      </section>
    </main>
  );
}
