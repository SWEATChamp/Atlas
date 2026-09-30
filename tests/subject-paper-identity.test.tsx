import React from 'react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import {
  matchSavedCombination,
  getMathsCombinations,
} from '@/components/subjects/paper-selection-panel'
import ChapterGroups, {
  filterComponentGroups,
  orderComponentGroups,
} from '@/components/subjects/chapter-groups'
import RouteSetupSheet from '@/components/subjects/route-setup-sheet'
import {
  resolveChapterAccessibility,
  buildChapterPaperMap,
  assembleComponentGroups,
  type ComponentGroup,
  type ChapterWithStatus,
} from '@/lib/subject-chapters'
import type { Subject, UserSubject, SubjectPaperSelection, Chapter, UserChapter } from '@/types'

// Mock route action for RouteSetupSheet
vi.mock('@/lib/actions/route', () => ({
  configureSubjectRoute: vi.fn().mockResolvedValue({ success: true }),
  transitionToA2: vi.fn().mockResolvedValue({ success: true }),
}))

// Deterministic Paper IDs (matching migration 024 seeds)
const SP_9709_P1 = '00000000-0000-5000-a000-000000097091'
const SP_9709_P2 = '00000000-0000-5000-a000-000000097092'
const SP_9709_P3 = '00000000-0000-5000-a000-000000097093'
const SP_9709_P4 = '00000000-0000-5000-a000-000000097094' // Mechanics
const SP_9709_P5 = '00000000-0000-5000-a000-000000097095' // Statistics 1
const SP_9709_P6 = '00000000-0000-5000-a000-000000097096' // Statistics 2

const SP_9231_P1 = '00000000-0000-5000-a000-000000092311' // Further Pure 1
const SP_9231_P2 = '00000000-0000-5000-a000-000000092312' // Further Pure 2
const SP_9231_P3 = '00000000-0000-5000-a000-000000092313' // Further Mechanics
const SP_9231_P4 = '00000000-0000-5000-a000-000000092314' // Further Stats

// Production persisted rows for Mathematics 9709 stats_mech (Migration 028 output)
const persistedStatsMechSelections: SubjectPaperSelection[] = [
  {
    id: 'sps-1',
    user_subject_id: 'us-maths-1',
    subject_paper_id: SP_9709_P1,
    component_name: 'Pure Mathematics 1',
    paper_number: 1,
    stage: 'as',
    created_at: '2026-09-28T00:00:00Z',
  },
  {
    id: 'sps-2',
    user_subject_id: 'us-maths-1',
    subject_paper_id: SP_9709_P5,
    component_name: 'Probability & Statistics 1',
    paper_number: 5,
    stage: 'as',
    created_at: '2026-09-28T00:00:00Z',
  },
  {
    id: 'sps-3',
    user_subject_id: 'us-maths-1',
    subject_paper_id: SP_9709_P3,
    component_name: 'Pure Mathematics 3',
    paper_number: 3,
    stage: 'a2',
    created_at: '2026-09-28T00:00:00Z',
  },
  {
    id: 'sps-4',
    user_subject_id: 'us-maths-1',
    subject_paper_id: SP_9709_P4,
    component_name: 'Mechanics',
    paper_number: 4,
    stage: 'a2',
    created_at: '2026-09-28T00:00:00Z',
  },
]

// Further Mathematics 9231 fm_fps selections
const persistedFurtherMathsSelections: SubjectPaperSelection[] = [
  {
    id: 'sps-fm-1',
    user_subject_id: 'us-fm-1',
    subject_paper_id: SP_9231_P1,
    component_name: 'Further Pure Mathematics 1',
    paper_number: 1,
    stage: 'as',
    created_at: '2026-09-28T00:00:00Z',
  },
  {
    id: 'sps-fm-3',
    user_subject_id: 'us-fm-1',
    subject_paper_id: SP_9231_P3,
    component_name: 'Further Mechanics',
    paper_number: 3,
    stage: 'as',
    created_at: '2026-09-28T00:00:00Z',
  },
  {
    id: 'sps-fm-2',
    user_subject_id: 'us-fm-1',
    subject_paper_id: SP_9231_P2,
    component_name: 'Further Pure Mathematics 2',
    paper_number: 2,
    stage: 'a2',
    created_at: '2026-09-28T00:00:00Z',
  },
  {
    id: 'sps-fm-4',
    user_subject_id: 'us-fm-1',
    subject_paper_id: SP_9231_P4,
    component_name: 'Further Probability & Statistics',
    paper_number: 4,
    stage: 'a2',
    created_at: '2026-09-28T00:00:00Z',
  },
]

// Helper to create a complete ChapterWithStatus fixture conforming strictly to production types
function makeChapter(
  id: string,
  title: string,
  number: number,
  component: string,
  stage: Chapter['stage'],
  isAccessible: boolean,
  subjectPaperIds: string[]
): ChapterWithStatus {
  return {
    chapter: {
      id,
      subject_id: 'subj-maths-1',
      title,
      number,
      component,
      description: null,
      is_global: true,
      stage,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    },
    userChapter: {
      id: `uc-${id}`,
      user_id: 'u-1',
      chapter_id: id,
      notes_status: 'none',
      google_doc_url: null,
      google_doc_id: null,
      confidence_level: null,
      last_reviewed_at: null,
      first_completed_at: null,
      revision_count: 0,
      personal_notes: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    avgScore: null,
    isAccessible,
    subjectPaperIds,
  }
}

// Full 9709 Component Groups fixture
function createMathsGroups(currentStage: 'as' | 'a2'): ComponentGroup[] {
  const isA2Active = currentStage === 'a2'

  return [
    {
      name: 'Pure 1',
      subjectPaperIds: [SP_9709_P1],
      chapters: [
        makeChapter('ch-p1-1', 'Quadratics', 1, 'Pure 1', 'as', true, [SP_9709_P1]),
        makeChapter('ch-p1-2', 'Functions', 2, 'Pure 1', 'as', true, [SP_9709_P1]),
      ],
    },
    {
      name: 'Pure 2',
      subjectPaperIds: [SP_9709_P2],
      chapters: [
        makeChapter('ch-p2-1', 'Algebra', 1, 'Pure 2', 'as', true, [SP_9709_P2]),
      ],
    },
    {
      name: 'Pure 3',
      subjectPaperIds: [SP_9709_P3],
      chapters: [
        makeChapter('ch-p3-1', 'Algebra', 1, 'Pure 3', 'a2', isA2Active, [SP_9709_P3]),
        makeChapter('ch-p3-2', 'Logarithmic Functions', 2, 'Pure 3', 'a2', isA2Active, [SP_9709_P3]),
      ],
    },
    {
      name: 'Mechanics',
      subjectPaperIds: [SP_9709_P4],
      chapters: [
        // In stats_mech, Mechanics is selected for A2, so locked during staged AS
        makeChapter('ch-m-1', 'Velocity and Acceleration', 1, 'Mechanics', 'route_dependent', isA2Active, [SP_9709_P4]),
      ],
    },
    {
      name: 'Statistics 1',
      subjectPaperIds: [SP_9709_P5],
      chapters: [
        // In stats_mech, Statistics 1 is selected for AS, so accessible during staged AS
        makeChapter('ch-s1-1', 'Representation of Data', 1, 'Statistics 1', 'route_dependent', true, [SP_9709_P5]),
      ],
    },
    {
      name: 'Statistics 2',
      subjectPaperIds: [SP_9709_P6],
      chapters: [
        makeChapter('ch-s2-1', 'The Poisson Distribution', 1, 'Statistics 2', 'a2', isA2Active, [SP_9709_P6]),
      ],
    },
  ]
}

describe('Subject Paper Identity & Chapter Accessibility Regressions', () => {
  describe('1. matchSavedCombination with Persisted Rows', () => {
    it('matches Mathematics stats_mech combination from realistic Migration 028 persisted rows', () => {
      const match = matchSavedCombination('9709', 'staged', persistedStatsMechSelections)
      expect(match).not.toBeNull()
      expect(match?.id).toBe('stats_mech')
      expect(match?.label).toContain('Pure 1 + Stats 1 (AS) → Pure 3 + Mechanics (A2)')
    })

    it('reproduces failure that occurred before identity-aware fix with exact name matching', () => {
      // The defect occurred because Migration 028 persisted catalogue names:
      // 'Probability & Statistics 1' !== 'Statistics 1' and 'Pure Mathematics 1' !== 'Pure 1'.
      // If we simulate old matching that strictly required component_name string equality:
      const oldMatchStrictName = (selections: SubjectPaperSelection[]) => {
        const combo = getMathsCombinations('staged').find((c) => c.id === 'stats_mech')!
        return combo.selections.every((sel) =>
          selections.some(
            (s) =>
              s.component_name === sel.component_name &&
              s.stage === sel.stage &&
              s.paper_number === sel.paper_number
          )
        )
      }
      expect(oldMatchStrictName(persistedStatsMechSelections)).toBe(false)

      // With our fix, matchSavedCombination succeeds using canonical paper identity:
      expect(matchSavedCombination('9709', 'staged', persistedStatsMechSelections)?.id).toBe('stats_mech')
    })

    it('matches Further Mathematics fm_fps combination with persisted catalogue names', () => {
      const match = matchSavedCombination('9231', 'staged', persistedFurtherMathsSelections)
      expect(match).not.toBeNull()
      expect(match?.id).toBe('fm_fps')
    })

    it('falls back to component name matching for legacy rows without subject_paper_id', () => {
      const legacySelections: SubjectPaperSelection[] = [
        { id: '1', user_subject_id: 'u1', subject_paper_id: null, component_name: 'Pure 1', paper_number: 1, stage: 'as', created_at: '' },
        { id: '2', user_subject_id: 'u1', subject_paper_id: null, component_name: 'Statistics 1', paper_number: 5, stage: 'as', created_at: '' },
        { id: '3', user_subject_id: 'u1', subject_paper_id: null, component_name: 'Pure 3', paper_number: 3, stage: 'a2', created_at: '' },
        { id: '4', user_subject_id: 'u1', subject_paper_id: null, component_name: 'Mechanics', paper_number: 4, stage: 'a2', created_at: '' },
      ]
      const match = matchSavedCombination('9709', 'staged', legacySelections)
      expect(match?.id).toBe('stats_mech')
    })
  })

  describe('2. Component Group Filtering & Accessibility Logic', () => {
    it('filters component groups in "selected" mode to only user chosen papers', () => {
      const allGroups = createMathsGroups('as')
      const filtered = filterComponentGroups(
        allGroups,
        persistedStatsMechSelections,
        true,
        'selected'
      )

      const groupNames = filtered.map((g) => g.name)
      // stats_mech includes Pure 1, Statistics 1, Pure 3, Mechanics
      expect(groupNames).toContain('Pure 1')
      expect(groupNames).toContain('Statistics 1')
      expect(groupNames).toContain('Pure 3')
      expect(groupNames).toContain('Mechanics')

      // Must NOT include non-selected elective components
      expect(groupNames).not.toContain('Pure 2')
      expect(groupNames).not.toContain('Statistics 2')
    })

    it('returns all component groups in "all" mode', () => {
      const allGroups = createMathsGroups('as')
      const filtered = filterComponentGroups(
        allGroups,
        persistedStatsMechSelections,
        true,
        'all'
      )
      expect(filtered).toHaveLength(6)
    })

    it('orders selected AS, selected A2, unselected AS, then unselected A2 groups', () => {
      const groups = createMathsGroups('as')
      const scrambledGroups = [groups[5], groups[1], groups[3], groups[0], groups[4], groups[2]]

      expect(
        orderComponentGroups(
          scrambledGroups,
          persistedStatsMechSelections,
          true,
          'selected'
        ).map((group) => group.name)
      ).toEqual(['Pure 1', 'Statistics 1', 'Pure 3', 'Mechanics'])

      expect(
        orderComponentGroups(
          scrambledGroups,
          persistedStatsMechSelections,
          true,
          'all'
        ).map((group) => group.name)
      ).toEqual([
        'Pure 1',
        'Statistics 1',
        'Pure 3',
        'Mechanics',
        'Pure 2',
        'Statistics 2',
      ])
    })

    it('filters Further Mathematics groups by normalized paper identity and excludes non-selected papers', () => {
      const furtherMathsGroups: ComponentGroup[] = [
        { name: 'Further Pure 1', subjectPaperIds: [SP_9231_P1], chapters: [] },
        { name: 'Further Pure 2', subjectPaperIds: [SP_9231_P2], chapters: [] },
        { name: 'Further Mechanics', subjectPaperIds: [SP_9231_P3], chapters: [] },
        { name: 'Further Probability & Statistics', subjectPaperIds: [SP_9231_P4], chapters: [] },
      ]
      const asOnlySelections = persistedFurtherMathsSelections.filter(
        (selection) => selection.stage === 'as'
      )

      const filtered = filterComponentGroups(
        furtherMathsGroups,
        asOnlySelections,
        true,
        'selected'
      )

      expect(filtered.map((group) => group.name)).toEqual([
        'Further Pure 1',
        'Further Mechanics',
      ])
      expect(filtered.some((group) => group.name === 'Further Pure 2')).toBe(false)
      expect(
        filtered.some((group) => group.name === 'Further Probability & Statistics')
      ).toBe(false)
    })

    it('supports legacy string filtering without admitting names from ID-bearing selections', () => {
      const groups: ComponentGroup[] = [
        { name: 'Pure 1', subjectPaperIds: [SP_9709_P1], chapters: [] },
        { name: 'Mechanics', subjectPaperIds: [SP_9709_P4], chapters: [] },
        { name: 'Statistics 1', subjectPaperIds: [SP_9709_P5], chapters: [] },
      ]

      const stringFiltered = filterComponentGroups(
        groups,
        ['Statistics 1'],
        true,
        'selected'
      )
      expect(stringFiltered.map((group) => group.name)).toEqual(['Statistics 1'])

      const legacyAndNormalizedSelections: SubjectPaperSelection[] = [
        {
          id: 'legacy-stats-1',
          user_subject_id: 'us-maths-1',
          subject_paper_id: null,
          component_name: 'Statistics 1',
          paper_number: 5,
          stage: 'as',
          created_at: '2026-09-28T00:00:00Z',
        },
        {
          id: 'normalized-mechanics-with-conflicting-name',
          user_subject_id: 'us-maths-1',
          subject_paper_id: SP_9709_P4,
          component_name: 'Pure 1',
          paper_number: 4,
          stage: 'a2',
          created_at: '2026-09-28T00:00:00Z',
        },
      ]

      const selectionFiltered = filterComponentGroups(
        groups,
        legacyAndNormalizedSelections,
        true,
        'selected'
      )
      expect(selectionFiltered.map((group) => group.name)).toEqual([
        'Mechanics',
        'Statistics 1',
      ])
      expect(selectionFiltered.some((group) => group.name === 'Pure 1')).toBe(false)
    })

    it('resolves chapter accessibility at staged AS: Pure 1 & Stats 1 editable, Pure 3 & Mechanics locked', () => {
      // 1. Pure 1 (AS paper) -> Accessible
      expect(
        resolveChapterAccessibility({
          chapterStage: 'as',
          chapterComponent: 'Pure 1',
          studyRoute: 'staged',
          currentStage: 'as',
          paperSelections: persistedStatsMechSelections,
          linkedPaperIds: [SP_9709_P1],
        })
      ).toBe(true)

      // 2. Statistics 1 (route_dependent, selected at AS) -> Accessible
      expect(
        resolveChapterAccessibility({
          chapterStage: 'route_dependent',
          chapterComponent: 'Statistics 1',
          studyRoute: 'staged',
          currentStage: 'as',
          paperSelections: persistedStatsMechSelections,
          linkedPaperIds: [SP_9709_P5],
        })
      ).toBe(true)

      // 3. Mechanics (route_dependent, selected at A2) -> Locked during AS
      expect(
        resolveChapterAccessibility({
          chapterStage: 'route_dependent',
          chapterComponent: 'Mechanics',
          studyRoute: 'staged',
          currentStage: 'as',
          paperSelections: persistedStatsMechSelections,
          linkedPaperIds: [SP_9709_P4],
        })
      ).toBe(false)

      // 4. Pure 3 (A2 paper) -> Locked during AS
      expect(
        resolveChapterAccessibility({
          chapterStage: 'a2',
          chapterComponent: 'Pure 3',
          studyRoute: 'staged',
          currentStage: 'as',
          paperSelections: persistedStatsMechSelections,
          linkedPaperIds: [SP_9709_P3],
        })
      ).toBe(false)
    })

    it('resolves chapter accessibility at staged A2: Pure 3 & Mechanics become unlocked', () => {
      // Statistics 1 remains accessible
      expect(
        resolveChapterAccessibility({
          chapterStage: 'route_dependent',
          chapterComponent: 'Statistics 1',
          studyRoute: 'staged',
          currentStage: 'a2',
          paperSelections: persistedStatsMechSelections,
          linkedPaperIds: [SP_9709_P5],
        })
      ).toBe(true)

      // Mechanics is now unlocked at A2
      expect(
        resolveChapterAccessibility({
          chapterStage: 'route_dependent',
          chapterComponent: 'Mechanics',
          studyRoute: 'staged',
          currentStage: 'a2',
          paperSelections: persistedStatsMechSelections,
          linkedPaperIds: [SP_9709_P4],
        })
      ).toBe(true)

      // Pure 3 is now unlocked at A2
      expect(
        resolveChapterAccessibility({
          chapterStage: 'a2',
          chapterComponent: 'Pure 3',
          studyRoute: 'staged',
          currentStage: 'a2',
          paperSelections: persistedStatsMechSelections,
          linkedPaperIds: [SP_9709_P3],
        })
      ).toBe(true)
    })

    it('falls back to component_name for legacy route-dependent selections without a paper ID', () => {
      const legacySelections: SubjectPaperSelection[] = [
        {
          id: 'legacy-statistics-1',
          user_subject_id: 'us-maths-1',
          subject_paper_id: null,
          component_name: 'Statistics 1',
          paper_number: 5,
          stage: 'as',
          created_at: '2026-09-28T00:00:00Z',
        },
      ]

      const accessible = resolveChapterAccessibility({
        chapterStage: 'route_dependent',
        chapterComponent: 'Statistics 1',
        studyRoute: 'staged',
        currentStage: 'as',
        paperSelections: legacySelections,
        linkedPaperIds: [],
      })

      expect(accessible).toBe(true)
    })
  })

  describe('3. Rendered Component Regression Verification', () => {
    afterEach(() => {
      cleanup()
    })

    const mockSubject: Subject = {
      id: 'subj-maths-1',
      code: '9709',
      name: 'Mathematics',
      color_hex: '#3b82f6',
      icon: 'calculator',
      is_global: true,
      is_available: true,
      created_by: null,
      created_at: '2026-01-01T00:00:00Z',
    }

    const mockEnrollment: UserSubject = {
      id: 'us-maths-1',
      user_id: 'user-1',
      subject_id: 'subj-maths-1',
      target_grade: 'A*',
      exam_date: '2026-06-01',
      priority: 1,
      is_archived: false,
      study_route: 'staged',
      current_stage: 'as',
      a2_unlocked_at: null,
      a2_unlock_method: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    it('RouteSetupSheet preselects stats_mech without prompting "Selection required"', () => {
      render(
        <RouteSetupSheet
          isOpen={true}
          onClose={vi.fn()}
          enrollment={mockEnrollment}
          subject={mockSubject}
          initialPaperSelections={persistedStatsMechSelections}
        />
      )

      // The option card for stats_mech should be visible
      expect(screen.getByText('Pure 1 + Stats 1 (AS) → Pure 3 + Mechanics (A2)')).toBeDefined()

      // Error message "Selection required" must not be present
      expect(screen.queryByText('Selection required')).toBeNull()
    })

    it('ChapterGroups renders selected papers by default and allows toggling to all components with accurate stage lock status', async () => {
      const groups = createMathsGroups('as')

      render(
        <ChapterGroups
          hasElectiveComponents={true}
          groups={groups}
          subjectColor="#3b82f6"
          paperSelections={persistedStatsMechSelections}
        />
      )

      // Default filter mode: "My Selected Papers"
      expect(screen.getByText('My Selected Papers')).toBeDefined()

      // Selected groups must be present
      expect(screen.getByText('Pure 1')).toBeDefined()
      expect(screen.getByText('Pure 3')).toBeDefined()
      expect(screen.getByText('Mechanics')).toBeDefined()
      expect(screen.getByText('Statistics 1')).toBeDefined()
      expect(
        screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
      ).toEqual(['Pure 1', 'Statistics 1', 'Pure 3', 'Mechanics'])

      // Non-selected groups must NOT be present
      expect(screen.queryByText('Pure 2')).toBeNull()
      expect(screen.queryByText('Statistics 2')).toBeNull()

      // ─── Verify user-visible accessibility for Statistics 1 vs Mechanics ───
      // Statistics 1 (selected for AS): accessible, not labelled "Locked (A2 Stage)", exposes editable controls
      const statsChapterRow = screen.getByText('Representation of Data').closest('.chapter-row-responsive')!
      expect(statsChapterRow).not.toBeNull()
      expect(within(statsChapterRow as HTMLElement).queryByText('Locked (A2 Stage)')).toBeNull()
      expect(within(statsChapterRow as HTMLElement).getByRole('button', { name: /Notes status:/i })).toBeDefined()
      expect(within(statsChapterRow as HTMLElement).getByRole('button', { name: /Rate confidence 1/i })).toBeDefined()

      // Mechanics (selected for A2): locked during staged AS, labelled "Locked (A2 Stage)", notes button not interactive
      const mechChapterRow = screen.getByText('Velocity and Acceleration').closest('.chapter-row-responsive')!
      expect(mechChapterRow).not.toBeNull()
      expect(within(mechChapterRow as HTMLElement).getByText('Locked (A2 Stage)')).toBeDefined()
      expect(within(mechChapterRow as HTMLElement).queryByRole('button', { name: /Notes status:/i })).toBeNull()

      // ─── Toggle to "View All Components" ───
      const toggleBtn = screen.getByRole('button', { name: /View All Components/i })
      fireEvent.click(toggleBtn)

      // Now all components are visible
      await waitFor(() => {
        expect(screen.getByText('All Components')).toBeDefined()
        expect(screen.getByText('Pure 2')).toBeDefined()
        expect(screen.getByText('Statistics 2')).toBeDefined()
        expect(
          screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
        ).toEqual([
          'Pure 1',
          'Statistics 1',
          'Pure 3',
          'Mechanics',
          'Pure 2',
          'Statistics 2',
        ])
      })

      // Toggle back to "View Selected Only"
      const toggleBackBtn = screen.getByRole('button', { name: /View Selected Only/i })
      fireEvent.click(toggleBackBtn)

      await waitFor(() => {
        expect(screen.getByText('My Selected Papers')).toBeDefined()
        expect(screen.queryByText('Pure 2')).toBeNull()
        expect(screen.queryByText('Statistics 2')).toBeNull()
        expect(
          screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
        ).toEqual(['Pure 1', 'Statistics 1', 'Pure 3', 'Mechanics'])
      })
    })
  })

  // ─── 4. Adversarial Normalized Paper Identity Tests ─────────────────────────
  describe('Adversarial Normalized Paper Identity (Authoritative Precedence)', () => {
    const STATS_PAPER_ID = '00000000-0000-5000-a000-000000097095'
    const MECH_PAPER_ID = '00000000-0000-5000-a000-000000097094'

    it('A chapter and selection have matching component names but different non-null paper IDs: access is false', () => {
      // Chapter is Statistics 1, linked to STATS_PAPER_ID
      // Selection has component_name: 'Statistics 1' BUT non-null subject_paper_id: MECH_PAPER_ID
      const accessible = resolveChapterAccessibility({
        chapterStage: 'route_dependent',
        chapterComponent: 'Statistics 1',
        studyRoute: 'staged',
        currentStage: 'as',
        linkedPaperIds: [STATS_PAPER_ID],
        paperSelections: [
          {
            id: 'sel-adversarial-1',
            user_subject_id: 'us-1',
            subject_paper_id: MECH_PAPER_ID,
            component_name: 'Statistics 1',
            paper_number: 4,
            stage: 'as',
            created_at: '2026-09-28T00:00:00Z',
          },
        ],
      })

      // Must be false: component-name fallback MUST NOT override a conflicting normalized ID
      expect(accessible).toBe(false)
    })

    it('A group and selection have matching component names but different non-null paper IDs: group is excluded', () => {
      const group: ComponentGroup = {
        name: 'Statistics 1',
        chapters: [],
        subjectPaperIds: [STATS_PAPER_ID],
      }

      const selectedItems: SubjectPaperSelection[] = [
        {
          id: 'sel-adversarial-1',
          user_subject_id: 'us-1',
          subject_paper_id: MECH_PAPER_ID,
          component_name: 'Statistics 1',
          paper_number: 4,
          stage: 'as',
          created_at: '2026-09-28T00:00:00Z',
        },
      ]

      const filtered = filterComponentGroups([group], selectedItems, true, 'selected')
      expect(filtered).toHaveLength(0)
    })

    it('mixed selection set: Pure 1 (normalized ID) and Statistics 1 (legacy null ID) both remain included', () => {
      const pure1Group: ComponentGroup = {
        name: 'Pure 1',
        chapters: [],
        subjectPaperIds: [SP_9709_P1],
      }
      const stats1Group: ComponentGroup = {
        name: 'Statistics 1',
        chapters: [],
        subjectPaperIds: [SP_9709_P5],
      }
      const mechanicsGroup: ComponentGroup = {
        name: 'Mechanics',
        chapters: [],
        subjectPaperIds: [SP_9709_P4],
      }

      const mixedSelections: SubjectPaperSelection[] = [
        {
          id: 'sps-norm-1',
          user_subject_id: 'us-1',
          subject_paper_id: SP_9709_P1,
          component_name: 'Pure Mathematics 1',
          paper_number: 1,
          stage: 'as',
          created_at: '2026-09-28T00:00:00Z',
        },
        {
          id: 'sps-legacy-5',
          user_subject_id: 'us-1',
          subject_paper_id: null, // legacy null ID
          component_name: 'Statistics 1',
          paper_number: 5,
          stage: 'as',
          created_at: '2026-09-28T00:00:00Z',
        },
      ]

      const filtered = filterComponentGroups(
        [pure1Group, stats1Group, mechanicsGroup],
        mixedSelections,
        true,
        'selected'
      )

      // Both Pure 1 (normalized) and Statistics 1 (legacy null-ID) must remain included
      expect(filtered).toHaveLength(2)
      expect(filtered.map((g) => g.name)).toEqual(['Pure 1', 'Statistics 1'])
      expect(filtered.some((g) => g.name === 'Mechanics')).toBe(false)
    })

    it('A legacy/custom selection has no paper ID but has the matching component name: fallback continues to work', () => {
      // 1. Accessibility resolver fallback
      const accessible = resolveChapterAccessibility({
        chapterStage: 'route_dependent',
        chapterComponent: 'Statistics 1',
        studyRoute: 'staged',
        currentStage: 'as',
        linkedPaperIds: [STATS_PAPER_ID],
        paperSelections: [
          {
            id: 'sel-legacy-1',
            user_subject_id: 'us-1',
            subject_paper_id: null,
            component_name: 'Statistics 1',
            paper_number: 5,
            stage: 'as',
            created_at: '2026-09-28T00:00:00Z',
          },
        ],
      })
      expect(accessible).toBe(true)

      // 2. Component group filter fallback
      const group: ComponentGroup = {
        name: 'Statistics 1',
        chapters: [],
        subjectPaperIds: [STATS_PAPER_ID],
      }
      const legacySelection: SubjectPaperSelection = {
        id: 'sel-legacy-1',
        user_subject_id: 'us-1',
        subject_paper_id: null,
        component_name: 'Statistics 1',
        paper_number: 5,
        stage: 'as',
        created_at: '2026-09-28T00:00:00Z',
      }
      const filtered = filterComponentGroups([group], [legacySelection], true, 'selected')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].name).toBe('Statistics 1')
    })

    it('A correct normalized paper ID unlocks and includes the item regardless of superficial naming differences', () => {
      // Chapter has component: 'Statistics 1', selection has component_name: 'Probability & Statistics 1'
      // Both share normalized paper ID STATS_PAPER_ID
      const accessible = resolveChapterAccessibility({
        chapterStage: 'route_dependent',
        chapterComponent: 'Statistics 1',
        studyRoute: 'staged',
        currentStage: 'as',
        linkedPaperIds: [STATS_PAPER_ID],
        paperSelections: [
          {
            id: 'sel-normalized-1',
            user_subject_id: 'us-1',
            subject_paper_id: STATS_PAPER_ID,
            component_name: 'Probability & Statistics 1',
            paper_number: 5,
            stage: 'as',
            created_at: '2026-09-28T00:00:00Z',
          },
        ],
      })
      expect(accessible).toBe(true)

      const group: ComponentGroup = {
        name: 'Statistics 1',
        chapters: [],
        subjectPaperIds: [STATS_PAPER_ID],
      }
      const normalizedSelection: SubjectPaperSelection = {
        id: 'sel-normalized-1',
        user_subject_id: 'us-1',
        subject_paper_id: STATS_PAPER_ID,
        component_name: 'Probability & Statistics 1',
        paper_number: 5,
        stage: 'as',
        created_at: '2026-09-28T00:00:00Z',
      }
      const filtered = filterComponentGroups([group], [normalizedSelection], true, 'selected')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].name).toBe('Statistics 1')
    })
  })

  // ─── 5. Batched Data Assembly Tests ─────────────────────────────────────────
  describe('Batched Data Assembly (buildChapterPaperMap & assembleComponentGroups)', () => {
    const P1_ID = '00000000-0000-5000-a000-000000097091'
    const P5_ID = '00000000-0000-5000-a000-000000097095'

    it('buildChapterPaperMap converts batched chapter_papers rows into normalized IDs per chapter without duplication', () => {
      const batchedRows = [
        { chapter_id: 'ch-1', subject_paper_id: P1_ID },
        { chapter_id: 'ch-2', subject_paper_id: P5_ID },
        { chapter_id: 'ch-2', subject_paper_id: P5_ID }, // duplicate batched row
        { chapter_id: null, subject_paper_id: P1_ID },   // null chapter_id guard
        { chapter_id: 'ch-3', subject_paper_id: null },   // null paper_id guard
      ]

      const embeddedChapters: Array<Chapter & { chapter_papers?: Array<{ subject_paper_id?: string }> }> = [
        {
          id: 'ch-2',
          subject_id: 'sub-1',
          title: 'Representing Data',
          number: 1,
          component: 'Statistics 1',
          description: null,
          is_global: true,
          stage: 'route_dependent',
          is_active: true,
          created_at: '2026-09-28T00:00:00Z',
          chapter_papers: [{ subject_paper_id: P5_ID }], // embedded duplicate
        },
      ]

      const map = buildChapterPaperMap(batchedRows, embeddedChapters)

      expect(map.get('ch-1')).toEqual([P1_ID])
      expect(map.get('ch-2')).toEqual([P5_ID]) // deduplicated
      expect(map.has('ch-3')).toBe(false)
      expect(map.has(null as unknown as string)).toBe(false)
    })

    it('assembleComponentGroups groups chapters, attaches normalized paper IDs, aggregates group IDs, and computes accessibility', () => {
      const chapters: Chapter[] = [
        {
          id: 'ch-1',
          subject_id: 'sub-1',
          title: 'Algebra',
          number: 1,
          component: 'Pure 1',
          description: null,
          is_global: true,
          stage: 'as',
          is_active: true,
          created_at: '2026-09-28T00:00:00Z',
        },
        {
          id: 'ch-2',
          subject_id: 'sub-1',
          title: 'Coordinate Geometry',
          number: 2,
          component: 'Pure 1',
          description: null,
          is_global: true,
          stage: 'as',
          is_active: true,
          created_at: '2026-09-28T00:00:00Z',
        },
        {
          id: 'ch-3',
          subject_id: 'sub-1',
          title: 'Representation of Data',
          number: 3,
          component: 'Statistics 1',
          description: null,
          is_global: true,
          stage: 'route_dependent',
          is_active: true,
          created_at: '2026-09-28T00:00:00Z',
        },
      ]

      const chapterPaperMap = new Map<string, string[]>([
        ['ch-1', [P1_ID]],
        ['ch-2', [P1_ID]],
        ['ch-3', [P5_ID]],
      ])

      const userChapters: UserChapter[] = [
        {
          id: 'uc-1',
          user_id: 'u-1',
          chapter_id: 'ch-1',
          notes_status: 'complete',
          google_doc_url: null,
          google_doc_id: null,
          confidence_level: 5,
          last_reviewed_at: null,
          first_completed_at: '2026-09-28T00:00:00Z',
          revision_count: 1,
          personal_notes: null,
          created_at: '2026-09-28T00:00:00Z',
          updated_at: '2026-09-28T00:00:00Z',
        },
      ]

      const chapterAccuracyMap = new Map([
        ['ch-1', { obtained: 18, available: 20 }],
      ])

      const enrollment: Pick<UserSubject, 'study_route' | 'current_stage'> = {
        study_route: 'staged',
        current_stage: 'as',
      }

      // User has selected Pure 1 (P1_ID) and Statistics 1 (P5_ID)
      const paperSelections: SubjectPaperSelection[] = [
        {
          id: 'sel-1',
          user_subject_id: 'us-1',
          subject_paper_id: P1_ID,
          component_name: 'Pure Mathematics 1',
          paper_number: 1,
          stage: 'as',
          created_at: '2026-09-28T00:00:00Z',
        },
        {
          id: 'sel-2',
          user_subject_id: 'us-1',
          subject_paper_id: P5_ID,
          component_name: 'Probability & Statistics 1',
          paper_number: 5,
          stage: 'as',
          created_at: '2026-09-28T00:00:00Z',
        },
      ]

      const groups = assembleComponentGroups({
        chapters,
        userChapters,
        chapterPaperMap,
        chapterAccuracyMap,
        enrollment,
        paperSelections,
      })

      expect(groups).toHaveLength(2)

      const pure1Group = groups.find((g) => g.name === 'Pure 1')
      expect(pure1Group).toBeDefined()
      expect(pure1Group?.chapters).toHaveLength(2)
      expect(pure1Group?.subjectPaperIds).toEqual([P1_ID])
      expect(pure1Group?.chapters[0].avgScore).toBe(90) // 18 / 20 * 100
      expect(pure1Group?.chapters[0].isAccessible).toBe(true)
      expect(pure1Group?.chapters[0].subjectPaperIds).toEqual([P1_ID])

      const statsGroup = groups.find((g) => g.name === 'Statistics 1')
      expect(statsGroup).toBeDefined()
      expect(statsGroup?.chapters).toHaveLength(1)
      expect(statsGroup?.subjectPaperIds).toEqual([P5_ID])
      expect(statsGroup?.chapters[0].isAccessible).toBe(true)
      expect(statsGroup?.chapters[0].subjectPaperIds).toEqual([P5_ID])
    })
  })
})
