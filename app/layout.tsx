import type { Metadata } from 'next';
import './globals.css';

/* The page carries no name anywhere a reader can see it. The name stays in the
   description because a portfolio that cannot be found by its author's name is not
   a portfolio - but the tab, which is chrome the visitor reads before the first
   frame, does not get to give the ending away. */
export const metadata: Metadata = {
  title: 'Architecting Possibilities',
  description: 'Independent designer and creative developer. Portfolio of Pouya Sadeghpour: a study in stone, gold, and the possibilities hidden inside limitations.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
