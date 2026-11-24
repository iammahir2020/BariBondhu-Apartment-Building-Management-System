/**
 * The resident's Report a fault page (`/resident/report-fault`, prototype `R-ReportFault.html`, RES-02). The resident
 * layout checks the role. `?emergency=fire` or `?emergency=lift` opens it as an emergency report, for "Log it for
 * repair" on the Emergency screen.
 *
 * @author Mahir Al Kamal
 */
import { ReportFaultForm } from '@/components/tickets/ReportFaultForm';
import type { EmergencyKind } from '@/components/tickets/EmergencyFirst';

/**
 * Report a fault.
 * @param props - The query string.
 * @returns The page.
 */
export default async function ReportFaultPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ emergency?: string | string[] }> }>) {
  const { emergency } = await searchParams;
  const kind: EmergencyKind | null =
    emergency === 'fire' || emergency === 'lift' ? emergency : null;
  return <ReportFaultForm emergency={kind} />;
}
