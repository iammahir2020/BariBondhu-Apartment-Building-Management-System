/**
 * The frame around the signed-out screens (Log in, Set new password, Forgot password, Reset password), from the
 * prototype's `S-Login.html` and `S-Login-Web.html`: a top bar with the language switch and Emergency, then the
 * logo, heading and intro. Full width on phones; a centred card from 640 px.
 *
 * @author Mahir Al Kamal
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Building2, Phone } from 'lucide-react';
import { LanguageButton } from '@/components/LanguageButton';
import { Button } from '@/components/ui/button';

/** Props for {@link AuthFrame}. */
export interface AuthFrameProps {
  /** Page heading, like "Log in to BariBondhu". */
  heading: string;
  /** One sentence under the heading. */
  intro: string;
  /** The form and messages. */
  children: ReactNode;
}

/**
 * Wraps a signed-out screen.
 * @param props - Heading, intro and content.
 * @returns The framed screen.
 */
export function AuthFrame({ heading, intro, children }: AuthFrameProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-card pr-2 pl-4">
        <span className="flex-1" />
        <LanguageButton />
        <Button asChild variant="destructive" size="sm" className="shrink-0 rounded-full">
          <Link href="/emergency" prefetch={false}>
            <Phone aria-hidden="true" />
            Emergency
          </Link>
        </Button>
      </header>
      <main className="flex w-full flex-col gap-7 px-6 py-8 sm:mx-auto sm:mt-6 sm:mb-10 sm:max-w-120 sm:rounded-[20px] sm:border sm:border-border sm:bg-card sm:p-8">
        <div className="flex flex-col gap-3.5">
          <span
            className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <Building2 className="size-7" />
          </span>
          <h1 className="text-[26px] font-bold">{heading}</h1>
          <p className="text-[15px] text-muted-foreground">{intro}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
