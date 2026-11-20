/**
 * The form for choosing a new password, used by Set new password (first log-in, BR-15) and Reset password: the
 * password twice, the 8-character rule shown under the field, and the error from the API.
 *
 * @author Mahir Al Kamal
 */
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { callApi } from '@/lib/apiClient';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/services/passwordRules';

/** Shown when the two fields differ. */
export const PASSWORDS_DIFFER_MESSAGE = "The two passwords don't match.";

/** Props for {@link NewPasswordForm}. */
export interface NewPasswordFormProps {
  /** API route that saves the password. */
  endpoint: string;
  /** HTTP method for {@link NewPasswordFormProps.endpoint}. */
  method?: string;
  /** Extra fields sent with the password, like a reset token. */
  extraBody?: Readonly<Record<string, string>>;
  /** Text on the button. */
  submitLabel: string;
}

/**
 * Asks for a new password twice and saves it, then goes to the page the API names in `home`.
 * @param props - Where to send it and the button text.
 * @returns The form.
 */
export function NewPasswordForm({
  endpoint,
  method = 'POST',
  extraBody,
  submitLabel,
}: NewPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem =
      passwordProblem(password) ?? (password !== confirm ? PASSWORDS_DIFFER_MESSAGE : null);
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    const result = await callApi<{ home: string }>(endpoint, method, { ...extraBody, password });
    if (result.ok) {
      router.replace(result.data.home);
      router.refresh();
      return;
    }
    setError(result.error.message);
    setSubmitting(false);
  }

  return (
    <form className="flex flex-col gap-4.5" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          name="new-password"
          type="password"
          autoComplete="new-password"
          aria-describedby="new-password-hint"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p id="new-password-hint" className="text-sm text-muted-foreground">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-password">Type it again</Label>
        <Input
          id="confirm-password"
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </div>

      <div aria-live="polite">
        {error && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={submitting || !password || !confirm}>
        {submitting ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
