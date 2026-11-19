/**
 * Root layout for every page: the HTML shell, page title, the prototype's fonts (Inter, Hind Siliguri for Bangla,
 * JetBrains Mono for codes) and the toast container.
 *
 * @author Mahir Al Kamal
 */
import type { Metadata } from 'next';
import { Hind_Siliguri, Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const hindSiliguri = Hind_Siliguri({
  subsets: ['bengali', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-hind-siliguri',
});

const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' });

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
    <html
      lang="en"
      className={`${inter.variable} ${hindSiliguri.variable} ${jetbrainsMono.variable} font-sans`}
    >
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
