/**
 * Shown inside the manager shell while a page under `/manager` loads, so a tap on the menu responds at once.
 *
 * @author Mahir Al Kamal
 */
import { PageLoading } from '@/components/PageLoading';

/**
 * The manager pages' loading state.
 * @returns The page placeholder.
 */
export default function ManagerLoading() {
  return <PageLoading />;
}
