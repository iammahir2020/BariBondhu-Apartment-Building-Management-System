/**
 * Forgot password (BR-15), from the "Reset your password" state of the prototype's `S-Login.html`.
 *
 * @author Mahir Al Kamal
 */
import { AuthFrame } from '@/components/auth/AuthFrame';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

/**
 * The Forgot password screen.
 * @returns The page.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthFrame
      heading="Reset your password"
      intro="Enter your username. A reset link goes to the email on your account."
    >
      <ForgotPasswordForm />
    </AuthFrame>
  );
}
