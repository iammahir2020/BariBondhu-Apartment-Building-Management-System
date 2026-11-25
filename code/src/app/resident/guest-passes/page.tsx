/**
 * The resident's New guest pass page (`/resident/guest-passes`, prototype `R-GuestPass-New.html`, RES-03), the
 * "Guests" tab. The resident layout checks the role.
 *
 * @author Mahir Al Kamal
 */
import { NewGuestPassForm } from '@/components/guestPasses/NewGuestPassForm';

/**
 * New guest pass.
 * @returns The page.
 */
export default function NewGuestPassPage() {
  return <NewGuestPassForm />;
}
