/**
 * Shapes a fault ticket for the resident's ticket routes (RES-02). A resident can see a neighbour's common-area ticket
 * (a "Me too" match, or one they follow), so the routes send only what the screens show: never the reporter's
 * account, the household, the description, the photo or the home times (NFR-06).
 *
 * @author Mahir Al Kamal
 */
import type { TicketView } from '@/components/tickets/ticketView';
import type { Ticket } from '@/models/Ticket';

/**
 * The fields of a ticket a resident's screen may get.
 * @param ticket - The ticket as saved.
 * @returns Only the fields in {@link TicketView}, with dates as ISO strings.
 */
export function toTicketView(ticket: Ticket): TicketView {
  return {
    id: ticket.id,
    title: ticket.title,
    category: ticket.category,
    status: ticket.status,
    placeId: ticket.placeId,
    dueDate: ticket.dueDate,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}
