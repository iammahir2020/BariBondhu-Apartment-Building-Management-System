/**
 * Home page placeholder. Login (step 6) will redirect each role to its own home. Until then it shows the theme's
 * card, button and status badges, and links to each role's home.
 *
 * @author Mahir Al Kamal
 */
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROLES, ROLE_LABELS } from '@/lib/roles';

/**
 * Plain landing page shown until login is in place.
 * @returns The home page.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-[22px] font-bold">BariBondhu</h1>
      <Card>
        <CardHeader>
          <CardTitle>November 2026 bill</CardTitle>
          <CardDescription>Theme check: these should match the UI prototype.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="warn">Unpaid</Badge>
            <Badge variant="info">Assigned</Badge>
            <Badge variant="ok">Paid</Badge>
            <Badge variant="bad">Rejected</Badge>
            <Badge variant="mute">Closed</Badge>
          </div>
          <Button>Pay now</Button>
          <Button variant="outline">See bill</Button>
        </CardContent>
      </Card>
      <nav aria-label="Role homes" className="flex flex-col gap-2">
        {ROLES.map((role) => (
          <Button key={role} asChild variant="secondary">
            <Link href={`/${role}`}>{ROLE_LABELS[role]}</Link>
          </Button>
        ))}
      </nav>
    </main>
  );
}
