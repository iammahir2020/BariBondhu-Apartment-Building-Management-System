/**
 * System administrator home page (`/admin`, BB-0012): the building setup, read only in Release 1 (ADM-01).
 *
 * @author Mahir Al Kamal
 */
import { AdminHome } from '@/components/home/AdminHome';

/**
 * System administrator home.
 * @returns The building setup.
 */
export default function AdminHomePage() {
  return <AdminHome />;
}
