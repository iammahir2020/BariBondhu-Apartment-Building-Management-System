/**
 * Dues (`/resident/dues`, RES-01): my household's bill and Pay online, from the prototype's `R-Dues.html` and
 * `R-Dues-Web.html`. The resident layout already keeps other roles out.
 *
 * @author Mahir Al Kamal
 */
import { DuesView } from '@/components/payments/DuesView';

/**
 * Dues.
 * @returns The page.
 */
export default function DuesPage() {
  return <DuesView />;
}
