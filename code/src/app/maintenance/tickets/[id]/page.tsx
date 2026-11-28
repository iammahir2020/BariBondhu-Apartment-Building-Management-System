/**
 * Maintenance ticket detail route (MNT-02).
 *
 * @author Adika Rahman
 */

import { TicketDetail } from '@/components/tickets/TicketDetail';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function MaintenanceTicketDetailPage({ params }: Props) {
  const { id } = await params;

  return <TicketDetail ticketId={id} />;
}
