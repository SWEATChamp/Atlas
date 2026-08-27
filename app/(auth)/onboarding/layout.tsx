import { redirect } from 'next/navigation'
import { getAuthenticatedContext, getCurrentProfile } from '@/lib/supabase/authenticated'

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

  return <>{children}</>
}
