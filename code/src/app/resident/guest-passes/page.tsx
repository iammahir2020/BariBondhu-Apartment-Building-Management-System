/**
 * The resident's Guests tab (`/resident/guest-passes`, prototype `R-GuestPass-New.html`, RES-03): the New guest pass
 * form, then the household's passes so an earlier code can be found and shared again. The resident layout checks the
 * role.
 *
 * @author Mahir Al Kamal
 */
import { MyGuestPassList } from '@/components/guestPasses/MyGuestPassList';
import { NewGuestPassForm } from '@/components/guestPasses/NewGuestPassForm';

/**
 * New guest pass, then Your passes.
 * @returns The page.
 */
export default function NewGuestPassPage() {
  return (
    <>
      <NewGuestPassForm />
      <div className="mx-auto mt-4 w-full max-w-2xl">
        <MyGuestPassList />
      </div>
    </>
  );
}
