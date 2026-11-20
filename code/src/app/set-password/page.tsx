/**
 * Set new password: shown after the first log-in with a temporary password, before anything else (BR-15). The
 * middleware sends users here until they have chosen their own password. In the style of `S-Login.html`.
 *
 * @author Mahir Al Kamal
 */
import { AuthFrame } from '@/components/auth/AuthFrame';
import { NewPasswordForm } from '@/components/auth/NewPasswordForm';

/**
 * The Set new password screen.
 * @returns The page.
 */
export default function SetPasswordPage() {
  return (
    <AuthFrame
      heading="Choose your own password"
      intro="The password the building manager gave you was only for the first log-in. Choose a new one to continue."
    >
      <NewPasswordForm endpoint="/api/passwords" submitLabel="Save and continue" />
    </AuthFrame>
  );
}
