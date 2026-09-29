import type { Chapter, UserChapter, SubjectPaperSelection, UserSubject } from '@/types'

export interface ChapterWithStatus {
  chapter: Chapter
  userChapter: UserChapter | null
  avgScore: number | null // from paper_question_attempts, null = no data
  isAccessible?: boolean
  subjectPaperIds?: string[]
}

export interface ComponentGroup {
  name: string
  chapters: ChapterWithStatus[]
  subjectPaperIds?: string[]
}

export interface ResolveChapterAccessibilityParams {
  chapterStage: string | null
  chapterComponent: string | null
  studyRoute: string
  currentStage: string | null
  paperSelections: SubjectPaperSelection[]
  linkedPaperIds?: string[]
}

/**
 * Determine route-dependent chapter accessibility.
 *
 * Rules:
 * 1. For staged routes at AS stage, AS-only and shared chapters are accessible; A2 chapters are locked.
 * 2. For route_dependent chapters:
 *    a. Authoritative: match selected subject_paper_id against chapter's linked paper IDs.
 *    b. Component-name fallback must never override a selection carrying a non-null but different
 *       subject_paper_id. Only legacy/custom selection rows without a normalized ID may participate
 *       in name fallback.
 */
export function resolveChapterAccessibility(params: ResolveChapterAccessibilityParams): boolean {
  const {
    chapterStage,
    chapterComponent,
    studyRoute,
    currentStage,
    paperSelections,
    linkedPaperIds = [],
  } = params

  if (studyRoute === 'unconfirmed' || !chapterStage) {
    return false
  }

  if (chapterStage === 'as' || chapterStage === 'shared') {
    return true
  }

  if (chapterStage === 'a2') {
    return currentStage === 'a2' || currentStage === 'full'
  }

  if (chapterStage === 'route_dependent') {
    // 1. Authoritative: match selected subject_paper_id against chapter's linked paper IDs
    const selByPaperId = linkedPaperIds.length > 0
      ? paperSelections.find(
          (s) => s.subject_paper_id && linkedPaperIds.includes(s.subject_paper_id)
        )
      : undefined

    // 2. Narrow fallback for legacy/custom selections lacking normalized paper identity.
    // Component-name fallback must never override a selection carrying a non-null but
    // different subject_paper_id. Only selections without a normalized ID participate.
    const sel =
      selByPaperId ??
      (chapterComponent
        ? paperSelections.find(
            (s) => !s.subject_paper_id && s.component_name === chapterComponent
          )
        : undefined)

    if (sel) {
      if (sel.stage === 'as') {
        return true
      }
      if (sel.stage === 'a2') {
        return currentStage === 'a2' || currentStage === 'full'
      }
    }
  }

  return false
}

/**
 * Assemble a lookup map of chapter_id -> subject_paper_id[] from batched query rows.
 * Also incorporates any embedded chapter_papers array if present on the chapter record.
 * Deduplicates IDs per chapter.
 */
export function buildChapterPaperMap(
  chapterPapers: Array<{ chapter_id?: string | null; subject_paper_id?: string | null }> | null | undefined,
  chapters?: Chapter[]
): Map<string, string[]> {
  const map = new Map<string, string[]>()

  for (const cp of chapterPapers ?? []) {
    if (cp?.chapter_id && cp?.subject_paper_id) {
      const list = map.get(cp.chapter_id) ?? []
      if (!list.includes(cp.subject_paper_id)) {
        list.push(cp.subject_paper_id)
      }
      map.set(cp.chapter_id, list)
    }
  }

  if (chapters) {
    for (const chapter of chapters) {
      const embedded = (chapter as unknown as { chapter_papers?: Array<{ subject_paper_id?: string }> })
        ?.chapter_papers
      if (Array.isArray(embedded)) {
        for (const cp of embedded) {
          if (cp?.subject_paper_id) {
            const list = map.get(chapter.id) ?? []
            if (!list.includes(cp.subject_paper_id)) {
              list.push(cp.subject_paper_id)
            }
            map.set(chapter.id, list)
          }
        }
      }
    }
  }

  return map
}

export interface AssembleComponentGroupsParams {
  chapters: Chapter[]
  userChapters: UserChapter[]
  chapterPaperMap: Map<string, string[]>
  chapterAccuracyMap?: Map<string, { obtained: number; available: number }>
  enrollment: Pick<UserSubject, 'study_route' | 'current_stage'>
  paperSelections: SubjectPaperSelection[]
}

/**
 * Pure data-assembly helper: groups chapters into ComponentGroups,
 * computes accuracy averages, attaches normalized subjectPaperIds,
 * and determines accessibility via resolveChapterAccessibility.
 */
export function assembleComponentGroups(params: AssembleComponentGroupsParams): ComponentGroup[] {
  const {
    chapters,
    userChapters,
    chapterPaperMap,
    chapterAccuracyMap,
    enrollment,
    paperSelections,
  } = params

  const ucMap = new Map((userChapters ?? []).map((uc) => [uc.chapter_id, uc]))
  const groupMap = new Map<string, { chapters: ChapterWithStatus[]; paperIds: Set<string> }>()

  chapters.forEach((chapter) => {
    const key = chapter.component ?? 'General'
    const entry = groupMap.get(key) ?? { chapters: [], paperIds: new Set<string>() }

    const stats = chapterAccuracyMap?.get(chapter.id)
    const avgScore = stats && stats.available > 0
      ? (stats.obtained / stats.available) * 100
      : null

    const linkedPaperIds = chapterPaperMap.get(chapter.id) ?? []
    linkedPaperIds.forEach((pid) => entry.paperIds.add(pid))

    // Determine accessibility
    const isAccessible = resolveChapterAccessibility({
      chapterStage: chapter.stage,
      chapterComponent: chapter.component,
      studyRoute: enrollment.study_route,
      currentStage: enrollment.current_stage,
      paperSelections,
      linkedPaperIds,
    })

    entry.chapters.push({
      chapter,
      userChapter: ucMap.get(chapter.id) ?? null,
      avgScore,
      isAccessible,
      subjectPaperIds: linkedPaperIds,
    })
    groupMap.set(key, entry)
  })

  return Array.from(groupMap.entries()).map(([name, entry]) => ({
    name,
    chapters: entry.chapters,
    subjectPaperIds: Array.from(entry.paperIds),
  }))
}
