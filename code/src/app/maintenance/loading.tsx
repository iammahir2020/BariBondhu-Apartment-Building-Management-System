/**
 * Shown inside the maintenance shell while a page under `/maintenance` loads, so a tap on the menu responds at once.
 *
 * @author Mahir Al Kamal
 */
import { PageLoading } from '@/components/PageLoading';

/**
 * The maintenance pages' loading state.
 * @returns The page placeholder.
 */
export default function MaintenanceLoading() {
  return <PageLoading />;
}
