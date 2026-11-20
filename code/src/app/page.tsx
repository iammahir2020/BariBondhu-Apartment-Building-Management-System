/**
 * The site's root. The middleware already sends signed-in users to their role's home and everyone else to Log in;
 * this redirect is the fallback.
 *
 * @author Mahir Al Kamal
 */
import { redirect } from 'next/navigation';

/**
 * Sends the visitor to Log in.
 * @returns Never renders.
 */
export default function HomePage(): never {
  redirect('/login');
}
