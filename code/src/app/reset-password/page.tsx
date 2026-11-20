/**
 * Reset password: opened from the link in the reset email (BR-15). Choosing a new password here also logs the
 * user in. In the style of `S-Login.html`.
 *
 * @author Mahir Al Kamal
 */
import Link from 'next/link';
import { CircleAlert } from 'lucide-react';
import { AuthFrame } from '@/components/auth/AuthFrame';
import { NewPasswordForm } from '@/components/auth/NewPasswordForm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RESET_LINK_INVALID_MESSAGE } from '@/services/passwordResetService';

/** Props Next passes to the page. */
interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * The Reset password screen. Without a token in the address, it explains that the link is not valid.
 * @param props - The URL's query, with the token from the email.
 * @returns The page.
 */
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token } = await searchParams;
  return (
    <AuthFrame heading="Choose a new password" intro="This link works once, for 30 minutes.">
      {token ? (
        <NewPasswordForm
          endpoint="/api/password-resets"
          method="PUT"
          extraBody={{ token }}
          submitLabel="Save and log in"
        />
      ) : (
        <div className="flex flex-col gap-4.5">
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{RESET_LINK_INVALID_MESSAGE}</AlertDescription>
          </Alert>
          <Button asChild className="w-full">
            <Link href="/forgot-password">Ask for a new link</Link>
          </Button>
        </div>
      )}
    </AuthFrame>
  );
}
