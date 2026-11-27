/**
 * Manager ticket list and details (BM-06, BM-07, BB-1307).
 *
 * @author Jannatul Ferdus Nishi
 */
import { ManagerTickets } from '@/components/tickets/ManagerTickets';

/**
 * Shows the building manager's ticket list.
 * @returns The ticket list and its detail panel.
 */
export default function ManagerTicketsPage() {
  return <ManagerTickets />;
}
