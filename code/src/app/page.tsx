/**
 * Home page placeholder. Login (step 6) will redirect each role to its own home.
 *
 * @author Mahir Al Kamal
 */

/**
 * Plain landing page shown until login is in place.
 * @returns The home page.
 */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold">BariBondhu</h1>
      <p className="mt-2">Apartment building management.</p>
    </main>
  );
}
