/**
 * Maintenance staff home page (`/maintenance`). Login sends every role to `/<role>`, and a maintenance worker's home
 * is their ticket list (MNT-01), so this page sends them to `/maintenance/tickets`.
 *
 * @author Mahir Al Kamal
 */
import { redirect } from 'next/navigation';

/**
 * Maintenance staff home: goes straight to My tickets.
 * @returns Nothing; it redirects.
 */
export default function MaintenanceHomePage(): never {
  redirect('/maintenance/tickets');
}
