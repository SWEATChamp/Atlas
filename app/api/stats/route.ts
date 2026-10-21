import { NextResponse, type NextRequest } from 'next/server'
import { getAuthenticatedContext } from '@/lib/supabase/authenticated'
import {
  getStatsOverviewData,
  getStatsChapterAccuracy,
  getStatsStudyIndicators,
  getStatsSubjectData,
} from '@/lib/actions/practice-sessions'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
}

export async function GET(request: NextRequest) {
  const { user } = await getAuthenticatedContext()
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    )
  }

  const searchParams = request.nextUrl.searchParams
  const subjectId = searchParams.get('subjectId') || null
  const section = searchParams.get('section') ?? 'all'

  try {
    if (section === 'overview') {
      const data = await getStatsOverviewData(subjectId)
      return NextResponse.json(data, { headers: NO_STORE_HEADERS })
    }
    if (section === 'chapters') {
      const data = await getStatsChapterAccuracy(subjectId)
      return NextResponse.json(data, { headers: NO_STORE_HEADERS })
    }
    if (section === 'indicators') {
      const data = await getStatsStudyIndicators(subjectId)
      return NextResponse.json(data, { headers: NO_STORE_HEADERS })
    }
    if (section === 'all') {
      const data = await getStatsSubjectData(subjectId)
      return NextResponse.json(data, { headers: NO_STORE_HEADERS })
    }
    return NextResponse.json(
      { error: 'Invalid section' },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  } catch (error) {
    console.error(`Failed to fetch stats section: ${section}`, error)
    return NextResponse.json(
      { error: 'Failed to load statistics. Please retry.' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
