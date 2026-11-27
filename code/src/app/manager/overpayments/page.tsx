/**
 * Overpayments page for the manager (`/manager/overpayments`, BM-04, BR-04, BB-0614).
 *
 * @author Mahir Al Kamal
 */
import { ManagerOverpayments } from '@/components/payments/ManagerOverpayments';

/**
 * Overpayments to refund.
 * @returns The list with Mark refunded.
 */
export default function ManagerOverpaymentsPage() {
  return <ManagerOverpayments />;
}
