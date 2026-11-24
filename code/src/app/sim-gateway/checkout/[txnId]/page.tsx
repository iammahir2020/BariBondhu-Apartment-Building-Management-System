/**
 * The simulated gateway's test checkout page (RES-01, BB-0608): `/sim-gateway/checkout/[txnId]`, where Pay on Dues
 * sends the resident. It is the gateway's page, so it has no app shell. Its API refuses anyone but a signed-in
 * resident.
 *
 * @author Mahir Al Kamal
 */
import { SimCheckout } from '@/components/payments/SimCheckout';

/** Props Next passes to the page. */
interface CheckoutPageProps {
  params: Promise<{ txnId: string }>;
}

/**
 * The checkout.
 * @param props - The transaction id from the URL.
 * @returns The page.
 */
export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { txnId } = await params;
  return <SimCheckout transactionId={decodeURIComponent(txnId)} />;
}
