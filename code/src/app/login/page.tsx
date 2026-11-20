/**
 * Log in page for every role (RES-06, SG-01, BM-01, CM-05, MNT-06), from the prototype's `S-Login.html` and
 * `S-Login-Web.html`.
 *
 * @author Mahir Al Kamal
 */
import { AuthFrame } from '@/components/auth/AuthFrame';
import { LoginForm } from '@/components/auth/LoginForm';

/** Props Next passes to the page. */
interface LoginPageProps {
  searchParams: Promise<{ reason?: string }>;
}

/**
 * The Log in screen. `?reason=idle` explains why the user was logged out (NFR-07).
 * @param props - The URL's query.
 * @returns The page.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { reason } = await searchParams;
  return (
    <AuthFrame
      heading="Log in to BariBondhu"
      intro="Use the username and password the building manager gave you."
    >
      <LoginForm endedForIdle={reason === 'idle'} />
    </AuthFrame>
  );
}
