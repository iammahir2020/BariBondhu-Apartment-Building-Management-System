/**
 * The Log in form (prototype `S-Login.html`): username and password, the error from the API, and the wait shown
 * after too many wrong passwords (BR-14).
 *
 * @author Mahir Al Kamal
 */
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleAlert, Clock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { callApi } from '@/lib/apiClient';

/** What the log-in route returns. */
interface LoginResponse {
  home: string;
}

/** A message to show above the button. */
type Notice =
  { kind: 'error'; message: string } | { kind: 'locked'; minutes: number } | { kind: 'idle' };

/** Props for {@link LoginForm}. */
export interface LoginFormProps {
  /** True when the user was sent here because their session was idle too long (NFR-07). */
  endedForIdle?: boolean;
}

/**
 * Log in form for every role.
 * @param props - Whether the last session ended for being idle.
 * @returns The form.
 */
export function LoginForm({ endedForIdle = false }: LoginFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(endedForIdle ? { kind: 'idle' } : null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const result = await callApi<LoginResponse>('/api/sessions', 'POST', { username, password });
    if (result.ok) {
      router.replace(result.data.home);
      router.refresh();
      return;
    }
    const retryAfter = result.error.details?.retryAfterSeconds;
    setNotice(
      result.status === 429 && typeof retryAfter === 'number'
        ? { kind: 'locked', minutes: Math.max(1, Math.ceil(retryAfter / 60)) }
        : { kind: 'error', message: result.error.message },
    );
    setPassword('');
    setSubmitting(false);
  }

  return (
    <form className="flex flex-col gap-4.5" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          className="font-mono"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <div aria-live="polite">
        {notice?.kind === 'error' && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{notice.message}</AlertDescription>
          </Alert>
        )}
        {notice?.kind === 'locked' && (
          <Alert variant="warn">
            <Clock aria-hidden="true" />
            <AlertTitle>Too many wrong passwords</AlertTitle>
            <AlertDescription>
              This device can try again in {notice.minutes}{' '}
              {notice.minutes === 1 ? 'minute' : 'minutes'}. Other devices are not affected.
            </AlertDescription>
          </Alert>
        )}
        {notice?.kind === 'idle' && (
          <Alert variant="info">
            <Clock aria-hidden="true" />
            <AlertDescription>
              You were logged out because the app was not used for a while.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={submitting || !username || !password}>
        {submitting ? 'Logging in…' : 'Log in'}
      </Button>
      <Button asChild variant="ghost" className="w-full">
        <Link href="/forgot-password">Forgot password?</Link>
      </Button>
    </form>
  );
}
