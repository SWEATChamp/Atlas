import { redirect } from 'next/navigation'

/**
 * Root page — always redirects.
 * Authenticated users → /dashboard (via proxy)
 * Unauthenticated users → /login (via proxy)
 * This page will never actually render; proxy.ts handles the redirect.
 */
export default function RootPage() {
  redirect('/dashboard')
}
