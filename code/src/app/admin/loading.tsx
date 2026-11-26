/**
 * Shown inside the admin shell while a page under `/admin` loads, so a tap on the menu responds at once.
 *
 * @author Mahir Al Kamal
 */
import { PageLoading } from '@/components/PageLoading';

/**
 * The admin pages' loading state.
 * @returns The page placeholder.
 */
export default function AdminLoading() {
  return <PageLoading />;
}
