/**
 * Root layout for every page: the HTML shell, page title and global styles.
 *
 * @author Mahir Al Kamal
 */
import type { Metadata } from 'next';
import './globals.css';

/** Title and description shown in the browser tab and search results. */
export const metadata: Metadata = {
  title: 'BariBondhu',
  description: 'Apartment building management for residents, staff and the building committee.',
};

/**
 * Wraps every page in the HTML document.
 * @param props - The page content to render.
 * @returns The HTML document.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
