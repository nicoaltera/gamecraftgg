import type { Metadata } from 'next';
import { Shantell_Sans, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google';
import Link from 'next/link';
import YoursLink from '@/components/YoursLink';
import './globals.css';

const shantell = Shantell_Sans({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' });
const instrument = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'GameSight — games with your friends in 60 seconds',
  description: 'Play instantly. Make a game from a sentence. Dare your friends to beat your score.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${shantell.variable} ${instrument.variable} ${plexMono.variable}`}>
      <body>
        <header className="site-header">
          <Link href="/" className="wordmark">
            gamesight<span className="wordmark-pen">✎</span>
          </Link>
          <nav className="site-nav">
            <Link href="/#games">play</Link>
            <Link href="/#make">make</Link>
            <YoursLink />
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <span>drawn into existence, one sentence at a time</span>
        </footer>
      </body>
    </html>
  );
}
