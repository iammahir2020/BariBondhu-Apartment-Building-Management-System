/**
 * The resident's My tickets page (`/resident/tickets`, prototype `R-Tickets.html`, RES-02). The resident layout
 * checks the role; the list loads from `/api/tickets`.
 *
 * @author Mahir Al Kamal
 */
import { MyTicketsList } from '@/components/tickets/MyTicketsList';

/**
 * My tickets.
 * @returns The page.
 */
export default function ResidentTicketsPage() {
  return <MyTicketsList />;
}
