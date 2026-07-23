import type { Metadata } from 'next';
import { Shantell_Sans, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google';
import Link from 'next/link';
import YoursLink from '@/components/YoursLink';
import AccountCard from '@/components/AccountCard';
import CookingTray from '@/components/CookingTray';
import './globals.css';

const shantell = Shantell_Sans({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' });
const instrument = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'GameCraft — games with your friends in 60 seconds',
  description: 'Play instantly. Make a game from a sentence. Dare your friends to beat your score.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${shantell.variable} ${instrument.variable} ${plexMono.variable}`}>
      <body>
        <div className="shell">
          {/* Persistent sketchbook sidebar (top bar on mobile). "Play" drops the
              player straight into the hottest game; the viewer's chevrons take
              it from there. */}
          <aside className="side">
            <Link href="/" className="wordmark">
              gamecraft
            </Link>
            <Link href="/watch" className="side-play">
              ▶ Play
            </Link>
            <nav className="side-nav">
              <Link href="/">home</Link>
              <Link href="/#make">create</Link>
              <YoursLink />
            </nav>
            <AccountCard />
            <div className="side-foot">drawn into existence, one sentence at a time</div>
          </aside>
          <div className="content">
            {children}
            <footer className="site-footer">
              <span>gamecraft — play instantly, make a game from a sentence</span>
            </footer>
          </div>
        </div>
        <CookingTray />
      </body>
    </html>
  );
}
