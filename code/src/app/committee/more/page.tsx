/**
 * Committee member's "More" page (`/committee/more`) for phones: every link of the side menu as a list. The bottom
 * menu links here because Opening balance and Fund summary are only in the side menu.
 *
 * @author Mahir Al Kamal
 */
import { MoreMenu } from '@/components/RoleNav';

/**
 * All committee links in one list.
 * @returns The More page.
 */
export default function CommitteeMorePage() {
  return (
    <>
      <h1 className="text-xl font-bold">More</h1>
      <MoreMenu role="committee" />
    </>
  );
}
