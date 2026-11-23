/**
 * Resident's "More" page (`/resident/more`) for phones: every link of the side menu as a list. The bottom menu links
 * here because the resident has links that are only in the side menu, like Report a fault.
 *
 * @author Mahir Al Kamal
 */
import { MoreMenu } from '@/components/RoleNav';

/**
 * All resident links in one list.
 * @returns The More page.
 */
export default function ResidentMorePage() {
  return (
    <>
      <h1 className="text-xl font-bold">More</h1>
      <MoreMenu role="resident" />
    </>
  );
}
