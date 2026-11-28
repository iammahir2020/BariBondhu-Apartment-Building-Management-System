'use client';

/**
 * Manager page for editing the building's emergency contact numbers (BB-2007).
 * The national emergency number 999 is fixed and cannot be changed.
 *
 * @author Adika Rahman
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { callApi } from '@/lib/apiClient';

type ContactLabel = 'Guard desk' | 'Manager';

interface EmergencyNumber {
  label: ContactLabel;
  phone: string;
}

interface EmergencyNumbersResponse {
  numbers: EmergencyNumber[];
}

interface UpdateEmergencyNumberResponse {
  number: EmergencyNumber;
}

const CONTACT_LABELS: readonly ContactLabel[] = ['Guard desk', 'Manager'];

/**
 * Manager's emergency numbers editing page.
 * @returns The fixed national number and editable building contacts.
 */
export default function ManagerEmergencyPage() {
  const [numbers, setNumbers] = useState<EmergencyNumber[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<Record<ContactLabel, string>>({
    'Guard desk': '',
    Manager: '',
  });
  const [loading, setLoading] = useState(true);
  const [savingLabel, setSavingLabel] = useState<ContactLabel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await callApi<EmergencyNumbersResponse>('/api/emergency-contacts', 'GET');

    setLoading(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setNumbers(result.data.numbers);
    setPhoneNumbers({
      'Guard desk':
        result.data.numbers.find((number) => number.label === 'Guard desk')?.phone ?? '',
      Manager: result.data.numbers.find((number) => number.label === 'Manager')?.phone ?? '',
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Saves one building contact number. */
  async function saveNumber(label: ContactLabel): Promise<void> {
    setSavingLabel(label);
    setError(null);
    setMessage(null);

    const result = await callApi<UpdateEmergencyNumberResponse>(
      '/api/emergency-contacts',
      'PATCH',
      {
        label,
        phone: phoneNumbers[label],
      },
    );

    setSavingLabel(null);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    const updatedNumber = result.data.number;

    setNumbers((current) =>
      current.map((number) => (number.label === updatedNumber.label ? updatedNumber : number)),
    );

    setPhoneNumbers((current) => ({
      ...current,
      [label]: updatedNumber.phone,
    }));

    setMessage(`${label} number updated successfully.`);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">Emergency Numbers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the building&apos;s emergency contact numbers.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2">
          <h2 className="font-semibold">National emergency number</h2>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="font-medium">Bangladesh Emergency Service</p>
              <p className="text-sm text-muted-foreground">Fixed number. It cannot be edited.</p>
            </div>
            <p className="text-xl font-bold">999</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="font-semibold">Building emergency contacts</h2>

          {loading && <p className="text-sm text-muted-foreground">Loading emergency numbers...</p>}

          {!loading &&
            CONTACT_LABELS.map((label) => {
              const currentNumber = numbers.find((number) => number.label === label);

              return (
                <div key={label} className="flex flex-col gap-2">
                  <Label htmlFor={`emergency-${label}`}>{label}</Label>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id={`emergency-${label}`}
                      className="h-12"
                      type="tel"
                      inputMode="numeric"
                      placeholder="Enter phone number"
                      value={phoneNumbers[label]}
                      onChange={(event) => {
                        setPhoneNumbers((current) => ({
                          ...current,
                          [label]: event.target.value,
                        }));
                        setMessage(null);
                      }}
                      disabled={savingLabel !== null}
                    />

                    <Button
                      className="h-12 sm:min-w-28"
                      onClick={() => void saveNumber(label)}
                      disabled={
                        savingLabel !== null ||
                        phoneNumbers[label].trim() === '' ||
                        phoneNumbers[label] === currentNumber?.phone
                      }
                    >
                      {savingLabel === label ? 'Saving...' : 'Save'}
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground">Enter 9 to 11 digits.</p>
                </div>
              );
            })}

          {error !== null && (
            <div
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          {message !== null && (
            <div
              role="status"
              className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800"
            >
              {message}
            </div>
          )}

          {!loading && error !== null && (
            <Button variant="outline" className="h-11" onClick={() => void load()}>
              Try again
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
