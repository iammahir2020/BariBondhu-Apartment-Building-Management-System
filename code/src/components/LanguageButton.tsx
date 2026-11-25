'use client';

/**
 * The বাং button in the top bar of every screen (the app shell and the signed-out screens). Bangla (NFR-22) isn't
 * built in Release 1, so the button opens a short notice saying so, in both languages, instead of doing nothing.
 *
 * @author Mahir Al Kamal
 */
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

/**
 * The language switch. Tapping it explains that Bangla is coming soon.
 * @returns The button and its notice.
 */
export function LanguageButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-full border border-border bg-card text-sm font-semibold text-foreground"
          lang="bn"
          aria-label="বাং: Switch to Bangla"
        >
          বাং
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-lg">
            <span lang="bn" className="block">
              বাংলা শিগগিরই আসছে
            </span>
            Bangla is coming soon
          </DialogTitle>
          <DialogDescription className="text-[15px]">
            BariBondhu is in English for now. You&apos;ll be able to switch to Bangla here in a
            later version.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button className="min-h-12 w-full sm:w-auto">OK</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
