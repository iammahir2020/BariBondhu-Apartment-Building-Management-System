/**
 * Shown inside the committee shell while a page under `/committee` loads, so a tap on the menu responds at once.
 *
 * @author Mahir Al Kamal
 */
import { PageLoading } from '@/components/PageLoading';

/**
 * The committee pages' loading state.
 * @returns The page placeholder.
 */
export default function CommitteeLoading() {
  return <PageLoading />;
}
