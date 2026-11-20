/**
 * The Forgot password form (prototype `S-Login.html`, "Reset your password"): the username, then either "Check
 * your email" with the masked address, or "This account has no email" (BR-15).
 *
 * @author Mahir Al Kamal
 */
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Check, CircleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { callApi } from '@/lib/apiClient';

/** What the reset route returns. */
type ResetResponse = { sent: true; maskedEmail: string } | { sent: false };

/** The message under the form. */
type Notice =
  { kind: 'sent'; maskedEmail: string } | { kind: 'noEmail' } | { kind: 'error'; message: string };

/**
 * Asks for a reset link by username.
 * @returns The form.
 */
export function ForgotPasswordForm() {
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const result = await callApi<ResetResponse>('/api/password-resets', 'POST', { username });
    if (!result.ok) {
      setNotice({ kind: 'error', message: result.error.message });
    } else if (result.data.sent) {
      setNotice({ kind: 'sent', maskedEmail: result.data.maskedEmail });
    } else {
      setNotice({ kind: 'noEmail' });
    }
    setSubmitting(false);
  }

  return (
    <form className="flex flex-col gap-4.5" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reset-username">Username</Label>
        <Input
          id="reset-username"
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

      <div aria-live="polite">
        {notice?.kind === 'sent' && (
          <Alert variant="ok">
            <Check aria-hidden="true" />
            <AlertTitle>Check your email</AlertTitle>
            <AlertDescription>
              We sent a link to {notice.maskedEmail}. It works for 30 minutes.
            </AlertDescription>
          </Alert>
        )}
        {notice?.kind === 'noEmail' && (
          <Alert variant="warn">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>This account has no email</AlertTitle>
            <AlertDescription>
              Ask the building manager for a new temporary password. If you are the manager, ask the
              system administrator.
            </AlertDescription>
          </Alert>
        )}
        {notice?.kind === 'error' && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{notice.message}</AlertDescription>
          </Alert>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={submitting || !username.trim()}>
        {submitting ? 'Sending…' : 'Send reset link'}
      </Button>
      <Button asChild variant="ghost" className="w-full">
        <Link href="/login">Back to log in</Link>
      </Button>
      <p className="text-sm text-muted-foreground">
        The administrator&apos;s own password is reset by the development team, not here.
      </p>
    </form>
  );
}
