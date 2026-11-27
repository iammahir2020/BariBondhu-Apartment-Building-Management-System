/**
 * Emergency numbers page (`/emergency`, SG-06, BR-12, BB-2006): open to everyone, signed in or not, from the
 * Emergency button on every screen and on Log in. A plain page with a way back, so it loads fast and works the same
 * for every role.
 *
 * @author Mahir Al Kamal
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { EmergencyView } from '@/components/emergency/EmergencyView';
import { LanguageButton } from '@/components/LanguageButton';

/**
 * The Emergency screen.
 * @returns The page.
 */
export default function EmergencyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-card pr-2 pl-2">
        <Link
          href="/"
          prefetch={false}
          className="inline-flex min-h-12 items-center gap-1.5 rounded-lg px-2 font-semibold text-primary"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
          Back
        </Link>
        <span className="flex-1" />
        <LanguageButton />
      </header>
      <main className="mx-auto w-full max-w-xl px-4 py-5 sm:py-8">
        <EmergencyView />
      </main>
    </div>
  );
}
