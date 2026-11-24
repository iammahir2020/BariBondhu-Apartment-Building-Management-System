/**
 * The resident's Pass code page (`/resident/guest-passes/[id]`, prototype `R-GuestPass-Code.html`, RES-03), opened
 * right after a pass is created. The resident layout checks the role; the API checks that the pass is the
 * household's own.
 *
 * @author Mahir Al Kamal
 */
import { PassCodeView } from '@/components/guestPasses/PassCodeView';

/**
 * Pass code.
 * @param props - The route's `[id]`.
 * @returns The page.
 */
export default async function PassCodePage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <PassCodeView passId={id} />;
}
