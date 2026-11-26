/**
 * Manager ticket detail route (BM-06, BM-07, BB-1307).
 *
 * @author Jannatul Ferdus Nishi
 */
import { ManagerTickets } from '@/components/tickets/ManagerTickets';

/**
 * Shows one manager-visible ticket alongside the ticket list.
 * @param props - The selected ticket route parameter.
 * @returns The ticket list and selected detail panel.
 */
export default async function ManagerTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ManagerTickets selectedTicketId={id} />;
}
