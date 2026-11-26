/**
 * What a role's pages show while the next page loads: grey placeholder blocks in the content area, inside the role's
 * shell, so a tap on the menu responds at once instead of leaving the old screen frozen. Used by each role's
 * `loading.tsx`. The blocks only pulse when the device allows motion.
 *
 * @author Mahir Al Kamal
 */

/**
 * Placeholder for a page that is still loading.
 * @returns A status region announcing "Loading…" to screen readers, with placeholder blocks.
 */
export function PageLoading() {
  return (
    <div role="status" aria-live="polite" className="flex w-full flex-col gap-4">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="flex flex-col gap-4 motion-safe:animate-pulse">
        <div className="h-8 w-48 rounded-lg bg-muted" />
        <div className="h-4 w-full max-w-md rounded bg-muted" />
        <div className="h-28 w-full rounded-[20px] bg-muted" />
        <div className="h-28 w-full rounded-[20px] bg-muted" />
      </div>
    </div>
  );
}
