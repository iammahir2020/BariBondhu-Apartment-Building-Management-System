/**
 * Maintenance worker's assigned tickets page (MNT-01).
 *
 * @author Adika Rahman
 */
import { AssignedTicketsList } from '@/components/tickets/AssignedTicketsList';

/**
 * Shows the signed-in maintenance worker's assigned tickets.
 *
 * @returns The My tickets page.
 */
export default function MaintenanceTicketsPage() {
  return <AssignedTicketsList />;
}
