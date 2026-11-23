'use client';

/**
 * Rates and history page for committee members (`/committee/rates`, C-Rates, CM-01): shows the rates in use,
 * lets the member enter new ones with the meeting date, and lists the rate history. Taka are turned into poisha
 * here because the API takes whole poisha; every rule is checked by the service behind `/api/rates`.
 *
 * @author Ayesha Siddiqa
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { callApi } from '@/lib/apiClient';

type ChargeType = 'service' | 'generator' | 'water';

interface RateRow {
  id: string;
  chargeType: ChargeType;
  amountPoisha: number;
}

interface HistoryRow {
  id: string;
  chargeType: ChargeType;
  oldAmountPoisha: number | null;
  newAmountPoisha: number;
  meetingDate: string;
  changedAt: string;
}

interface RatesResponse {
  current: RateRow[];
  history: HistoryRow[];
}

const CHARGES: readonly { type: ChargeType; label: string }[] = [
  { type: 'service', label: 'Service charge' },
  { type: 'generator', label: 'Generator' },
  { type: 'water', label: 'Water' },
];

const LABELS: Readonly<Record<ChargeType, string>> = {
  service: 'Service charge',
  generator: 'Generator',
  water: 'Water',
};

/** Whole poisha to a plain taka number for an input, like 380000 to "3800". */
function toTaka(poisha: number): string {
  return (poisha / 100).toString();
}

/** Money for reading, like ৳3,800. */
function formatMoney(poisha: number): string {
  return `৳${(poisha / 100).toLocaleString('en-US')}`;
}

/** What the member typed to whole poisha; null when blank or not a number. */
function toPoisha(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const taka = Number(trimmed);
  return Number.isFinite(taka) ? Math.round(taka * 100) : null;
}

/** A date or timestamp for reading, like 13 Nov 2026. */
function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Dhaka',
  });
}

/**
 * The Rates and history page.
 * @returns The rate form and the rate history.
 */
export default function CommitteeRatesPage() {
  const [current, setCurrent] = useState<RateRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [inputs, setInputs] = useState<Record<ChargeType, string>>({
    service: '',
    generator: '',
    water: '',
  });
  const [meetingDate, setMeetingDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await callApi<RatesResponse>('/api/rates', 'GET');
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setCurrent(result.data.current);
    setHistory(result.data.history);
    const next: Record<ChargeType, string> = { service: '', generator: '', water: '' };
    for (const rate of result.data.current) next[rate.chargeType] = toTaka(rate.amountPoisha);
    setInputs(next);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** The current rate of a charge in taka text, or '' when none is set. */
  function currentText(type: ChargeType): string {
    const rate = current.find((row) => row.chargeType === type);
    return rate ? toTaka(rate.amountPoisha) : '';
  }

  const changed = CHARGES.filter(({ type }) => inputs[type].trim() !== currentText(type));

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    setSaved(false);
    for (const { type } of changed) {
      const result = await callApi('/api/rates', 'POST', {
        chargeType: type,
        amountPoisha: toPoisha(inputs[type]),
        meetingDate: meetingDate === '' ? null : meetingDate,
      });
      if (!result.ok) {
        setError(result.error.message);
        setSaving(false);
        await load();
        return;
      }
    }
    setSaved(true);
    setSaving(false);
    await load();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-bold">Charge rates</h1>
      <p className="text-sm text-muted-foreground">
        Enter the rates the meeting agreed. They apply to bills made after you save; bills already
        made keep their rates.
      </p>

      <Card>
        <CardContent className="flex flex-col gap-4">
          {CHARGES.map(({ type, label }) => {
            const rate = current.find((row) => row.chargeType === type);
            return (
              <div key={type} className="flex items-center gap-3">
                <div className="grow">
                  <Label htmlFor={`rate-${type}`} className="text-base font-semibold">
                    {label}
                  </Label>
                  <div className="text-sm text-muted-foreground">
                    {rate ? `Now ${formatMoney(rate.amountPoisha)} per flat` : 'No rate set yet'}
                  </div>
                </div>
                <Input
                  id={`rate-${type}`}
                  inputMode="decimal"
                  className="h-12 w-32 text-right font-bold"
                  value={inputs[type]}
                  onChange={(event) => setInputs({ ...inputs, [type]: event.target.value })}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <Label htmlFor="meeting-date">Date of the meeting that agreed this</Label>
        <Input
          id="meeting-date"
          type="date"
          className="h-12"
          value={meetingDate}
          onChange={(event) => setMeetingDate(event.target.value)}
        />
      </div>

      {error !== null && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      {saved && (
        <div
          role="status"
          className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800"
        >
          New rates saved. They apply to bills made from now on.
        </div>
      )}

      <Button
        className="h-12 w-full"
        disabled={saving || changed.length === 0}
        onClick={() => void save()}
      >
        Save new rates
      </Button>

      <h2 className="mt-2 text-lg font-semibold">Rate history</h2>
      <Card>
        <CardContent className="flex flex-col gap-3">
          {history.length === 0 && (
            <p className="text-sm text-muted-foreground">No rate changes yet.</p>
          )}
          {history.map((entry) => (
            <div key={entry.id}>
              <div className="font-semibold">
                {LABELS[entry.chargeType]}{' '}
                {entry.oldAmountPoisha === null
                  ? formatMoney(entry.newAmountPoisha)
                  : `${formatMoney(entry.oldAmountPoisha)} → ${formatMoney(entry.newAmountPoisha)}`}
              </div>
              <div className="text-sm text-muted-foreground">
                Meeting {formatDate(entry.meetingDate)} · entered {formatDate(entry.changedAt)}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
