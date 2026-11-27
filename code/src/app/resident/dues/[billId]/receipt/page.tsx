/**
 * Receipt (`/resident/dues/[billId]/receipt`, RES-01, UC-R08), from the prototype's `R-Receipt.html` and
 * `R-Receipt-Web.html`. The resident layout keeps other roles out; the API gives a resident only their own receipts.
 *
 * @author Mahir Al Kamal
 */
import { ReceiptView } from '@/components/payments/ReceiptView';

/** Props Next passes to the page. */
interface ReceiptPageProps {
  params: Promise<{ billId: string }>;
}

/**
 * The receipt.
 * @param props - The bill id from the URL.
 * @returns The page.
 */
export default async function ReceiptPage({ params }: ReceiptPageProps) {
  const { billId } = await params;
  return <ReceiptView billId={billId} />;
}
