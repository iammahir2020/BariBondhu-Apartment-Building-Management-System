'use client';

/**
 * Signed-in guard's seven-day duty schedule (BB-1908, SG-05).
 *
 * @author Tawhid Bin Moslim
 */

import { useCallback, useEffect, useState } from 'react';
import type { Shift } from '@/models';
import { callApi } from '@/lib/apiClient';

interface GuardDutyResponse {
  shifts: Shift[];
  noShiftToday: boolean;
}

function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat('en-BD', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(value));
}

function formatTime(value: string | Date): string {
  return new Intl.DateTimeFormat('en-BD', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Dhaka',
  }).format(new Date(value));
}

/**
 * Displays the guard's seven-day assigned duty schedule,
 * including overnight shifts and the no-shift-today state.
 */
export function GuardDuty() {
  const [duty, setDuty] = useState<GuardDutyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDuty = useCallback(async () => {
    setLoading(true);
    setError('');

    const response = await callApi<GuardDutyResponse>('/api/guard/shifts/mine', 'GET');

    if (!response.ok) {
      setError(response.error.message || 'Unable to load your shifts.');
      setLoading(false);
      return;
    }

    setDuty(response.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadDuty();
  }, [loadDuty]);

  if (loading) {
    return <p className="p-4">Loading your duty schedule...</p>;
  }

  if (error) {
    return (
      <div className="space-y-3 p-4">
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
        <button onClick={() => void loadDuty()} className="rounded border px-4 py-2">
          Retry
        </button>
      </div>
    );
  }

  if (!duty) return null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-4">
      <header>
        <h1 className="text-2xl font-bold">My shifts</h1>
        <p className="text-sm text-gray-500">Your duty schedule for the next 7 days</p>
      </header>

      {duty.noShiftToday && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">No shift today</p>
        </div>
      )}

      <section className="overflow-hidden rounded-lg border">
        <h2 className="border-b p-4 font-semibold">Upcoming shifts</h2>

        {duty.shifts.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No shifts scheduled in the next 7 days.</p>
        ) : (
          <div>
            {duty.shifts.map((shift) => {
              const overnight =
                new Date(shift.startsAt).toLocaleDateString('en-CA', {
                  timeZone: 'Asia/Dhaka',
                }) !==
                new Date(shift.endsAt).toLocaleDateString('en-CA', {
                  timeZone: 'Asia/Dhaka',
                });

              return (
                <article
                  key={shift.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-b-0"
                >
                  <div>
                    <p className="font-semibold">{formatDate(shift.startsAt)}</p>
                    <p className="text-sm text-gray-600">
                      {formatTime(shift.startsAt)} - {formatTime(shift.endsAt)}
                    </p>
                    {overnight && (
                      <p className="text-xs text-gray-500">
                        Ends next day · {formatDate(shift.endsAt)}
                      </p>
                    )}
                  </div>

                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                    {shift.status}
                  </span>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-sm text-gray-500">
        Only the manager can change shifts. Please ask your manager if you need a shift change.
      </p>
    </main>
  );
}
