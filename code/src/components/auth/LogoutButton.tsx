/**
 * Log out button in the app shell's top bar. Ends the session in this browser only and goes to Log in.
 *
 * @author Mahir Al Kamal
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { callApi } from '@/lib/apiClient';

/**
 * Logs the user out. Shows only the icon on phones and tablets, the text too from 1024 px.
 * @returns The button.
 */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    const result = await callApi<null>('/api/sessions', 'DELETE');
    if (!result.ok) {
      toast.error(result.error.message);
      setBusy(false);
      return;
    }
    router.replace('/login');
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="size-12 shrink-0 px-0 lg:w-auto lg:px-4"
      aria-label="Log out"
      onClick={handleClick}
      disabled={busy}
    >
      <LogOut aria-hidden="true" />
      <span className="hidden lg:inline">Log out</span>
    </Button>
  );
}
