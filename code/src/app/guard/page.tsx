/**
 * Security guard home page.
 * BB-1706, SG-02.
 *
 * @author Mahir Al Kamal
 */

import { GuardPassCheck } from '@/components/guestPasses/GuardPassCheck';

/**
 * Security guard home with the guest pass checking interface.
 */
export default function GuardHomePage() {
  return <GuardPassCheck />;
}
