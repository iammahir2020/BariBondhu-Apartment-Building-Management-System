/**
 * Manager's "More" page (`/manager/more`) for phones: every section of the side menu as a list, like the
 * prototype's `M-More-Mobile`. The bottom menu links here once the manager has more links than fit on a phone.
 *
 * @author Mahir Al Kamal
 */
import { MoreMenu } from '@/components/RoleNav';

/**
 * All manager sections in one list.
 * @returns The More page.
 */
export default function ManagerMorePage() {
  return (
    <>
      <h1 className="text-xl font-bold">More</h1>
      <MoreMenu role="manager" />
    </>
  );
}
