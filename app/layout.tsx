import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#100904',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://p4sadx.vercel.app'),
  title: {
    default: 'Pouya Sadeghpour — Architecting Possibilities',
    template: '%s | Pouya Sadeghpour',
  },
  description:
    'Senior Creative Technologist & Front-End Architect. An interactive study in gypsum, real-time GLSL shaders, physics-baked Voronoi fracture, and Kintsugi philosophy.',
  keywords: [
    'Pouya Sadeghpour',
    'Creative Technologist',
    'WebGL Engineer',
    'Three.js',
    'GLSL Shaders',
    'Front-End Architect',
    'Spatial Web',
    'Kintsugi',
    'Architectural Digital Twin',
    'Design System',
  ],
  authors: [{ name: 'Pouya Sadeghpour', url: 'https://linkedin.com/in/onepouya' }],
  creator: 'Pouya Sadeghpour',
  publisher: 'BeyondEx Studio',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://p4sadx.vercel.app',
    siteName: 'Pouya Sadeghpour — Portfolio',
    title: 'Pouya Sadeghpour — Architecting Possibilities',
    description:
      'Independent designer & WebGL architect. A scroll-driven eleven-act cinematic journey in WebGL 2.0, Voronoi shell fracture, and Kintsugi.',
    images: [
      {
        url: '/og.jpg',
        width: 1200,
        height: 630,
        alt: 'Pouya Sadeghpour — Architecting Possibilities',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pouya Sadeghpour — Architecting Possibilities',
    description:
      'Senior Creative Technologist & WebGL Architect. 11-act scroll-driven spatial journey in Three.js and custom GLSL.',
    images: ['/og.jpg'],
    creator: '@onepouya',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://p4sadx.vercel.app',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Pouya Sadeghpour',
  jobTitle: 'Senior Creative Technologist & Lead Front-End Architect',
  url: 'https://p4sadx.vercel.app',
  sameAs: [
    'https://linkedin.com/in/onepouya',
    'https://github.com/pouya-wp',
    'https://t.me/pouya_dmg',
    'https://instagram.com/pouya.sadeghpour',
  ],
  knowsAbout: [
    'WebGL',
    'Three.js',
    'GLSL Shaders',
    'React',
    'Next.js',
    'TypeScript',
    'Creative Coding',
    'Spatial Architecture',
    'Design Systems',
  ],
  alumniOf: 'BeyondEx Studio',
  description:
    'Creative Technologist and WebGL Engineer synthesizing sculptural form, procedural GLSL shaders, and resilient digital architectures.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
