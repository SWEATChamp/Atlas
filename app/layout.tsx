import type { Metadata, Viewport } from 'next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Atlas',
    template: '%s · Atlas',
  },
  description:
    'A-Level revision tracking built for CAIE students. Master your subjects, track progress, and hit your target grades.',
  keywords: ['A-Level', 'CAIE', 'revision', 'study tracker', 'past papers'],
  authors: [{ name: 'Atlas' }],
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  openGraph: {
    title: 'Atlas — A-Level Revision Tracker',
    description: 'Track your A-Level revision, master past papers, and hit your target grades.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#101216',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  )
}
