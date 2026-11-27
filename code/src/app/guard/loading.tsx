/**
 * Shown inside the guard shell while a page under `/guard` loads, so a tap on the menu responds at once.
 *
 * @author Mahir Al Kamal
 */
import { PageLoading } from '@/components/PageLoading';

/**
 * The guard pages' loading state.
 * @returns The page placeholder.
 */
export default function GuardLoading() {
  return <PageLoading />;
}
