/**
 * Shown inside the resident shell while a page under `/resident` loads, so a tap on the menu responds at once.
 *
 * @author Mahir Al Kamal
 */
import { PageLoading } from '@/components/PageLoading';

/**
 * The resident pages' loading state.
 * @returns The page placeholder.
 */
export default function ResidentLoading() {
  return <PageLoading />;
}
