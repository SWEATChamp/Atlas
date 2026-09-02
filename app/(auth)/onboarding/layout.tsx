import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedContext, getCurrentProfile } from '@/lib/supabase/authenticated'
import MotionProvider from '@/components/motion-provider'

export const metadata: Metadata = {
  title: 'Onboarding',
}

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = await getAuthenticatedContext()
  if (!user) {
    redirect('/login?next=/onboarding')
  }

  const profile = await getCurrentProfile()
  if (profile?.onboarding_completed) {
    redirect('/dashboard')
  }

  return <MotionProvider>{children}</MotionProvider>
}
