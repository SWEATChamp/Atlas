# A-Level Atlas — Goal and Milestone Plan

## Document Purpose & Authority

This document (`goal.md`) is the authoritative master product plan for A-Level Atlas. It defines long-term product direction, milestone objectives, scope boundaries, feature deliverables, calculation rules, and verification standards.

Related repository documentation serves distinct complementary roles:
- [`docs/roadmap.md`](docs/roadmap.md) tracks phase-by-phase implementation status, active development tasks, and release milestones.
- [`docs/changelog.md`](docs/changelog.md) maintains the historical record of shipped features, improvements, and operational changes.
- [`docs/deployment.md`](docs/deployment.md) documents deployment procedures, verification gates, and hosted infrastructure records.

## Active Goal

Develop a gamified study platform that helps Cambridge International AS & A Level students study more effectively by turning syllabus progress, past-paper performance, target grades, exam readiness, and daily revision into clear, motivating actions.

Atlas should help each student answer three questions:

1. What should I study today?
2. Am I on track for my target grade?
3. What must I improve before the examination?

## Product Principles

- **Actionable:** Convert performance data into specific study tasks.
- **Accurate:** Use official syllabus, paper, and grade-threshold data with visible provenance.
- **Motivating:** Reward meaningful study through missions, XP, levels, streaks, and achievements.
- **Personalised:** Respect each student's subjects, AS/A2 route, paper combination, exam dates, and target grades.
- **Honest:** Clearly distinguish official thresholds from estimates or recommendations.
- **Accessible:** Support keyboard navigation, screen readers, reduced motion, mobile layouts, and minimum 44×44px touch targets.
- **Safe:** Preserve user data, enforce ownership through RLS, and release database and application changes through reviewed verification gates.

## Current Baseline

The five-subject MVP currently supports:

- Mathematics 9709
- Further Mathematics 9231
- Physics 9702
- Chemistry 9701
- Computer Science 9618

Implemented foundations include authentication, onboarding, subject routes, chapter progress, confidence tracking, past-paper logging, readiness, missions, XP, streaks, achievements, subject management, responsive layouts, and the accessible v1.2.0 UI foundation.

The v1.2.0 UI foundation has been merged to main, deployed to production, verified through authenticated production smoke testing, tagged with annotated tag `v1.2.0`, and published as a stable GitHub Release.

---

## Milestone 1 — Stable Five-Subject Study Foundation

**Status:** Complete baseline

**Objective:** Maintain a dependable academic-data and study-tracking foundation for the five supported subjects.

**Deliverables:**

- Correct syllabus chapters and paper-component mappings.
- AS-only, staged A Level, and full linear A Level routes.
- Chapter notes status and confidence tracking.
- Past-paper and question-level attempt logging.
- Separate AS and A2 readiness.
- Safe subject enrolment, archival, and restoration.

**Verification checks:**

- **Migration check:** Hosted migration history matches repository migrations 000–026.
- **Catalogue check:** All five subjects expose the correct active chapters, papers, routes, and mappings.
- **Route check:** AS/A2 content visibility matches every supported study route.
- **Data-preservation check:** Removing and restoring a subject preserves historical progress, papers, missions, and XP.
- **Security check:** RLS and ownership checks prevent users from accessing another user's data.
- **Quality gate:** Database tests, unit tests, type checking, lint, build, and whitespace checks pass.

---

## Milestone 2 — Accessible and Cohesive UI Foundation

**Status:** Complete baseline (deployed to production, verified, tagged, and released)

**Objective:** Establish a consistent, accessible interface that can support future analytics and gamification without accumulating incompatible UI patterns.

**Deliverables:**

- Shared accessible dialog primitive.
- Consistent design tokens, controls, loading states, and reduced-motion behaviour.
- Subject-controls guide with persistent dismissal and manual reopening.
- Responsive layouts down to a 320px viewport.
- Semantic buttons, links, radio groups, labels, and focus restoration.
- No unnecessary animation dependency in unauthenticated routes.

**Verification checks:**

- **Interaction check:** Dialog opening, progression, dismissal, Escape handling, focus trapping, and return focus work in real DOM tests and production smoke testing.
- **Accessibility check:** Controls have accessible names, semantic roles, keyboard operation, visible focus, and reduced-motion compliance.
- **Responsive check:** Dashboard, Subjects, Subject details, and Past Papers have zero horizontal overflow at 320px, 375px, 390px, 768px, and 1280px viewport widths.
- **Touch check:** Interactive controls meet the 44×44px minimum across mobile and tablet touch-oriented viewports (320px–768px).
- **Bundle check:** Login does not load authenticated-only animation code.
- **Release check:** Preview and production deployments (`9RCwZ6xAY7ohAqxNn2msJzcCXcUi`, `8shqSC2QMjNVMsVn6ABoc36xWvm4`) and production smoke tests passed; annotated tag `v1.2.0` (object `1c4524fcd1f747a7e00674d7c0aa8551f2180d94`) and the stable GitHub Release were published.

---

## Milestone 3 — Official Grade-Threshold Data Foundation

**Status:** Planned

**Objective:** Build a trustworthy, versioned source of Cambridge grade-threshold data for the five supported subjects.

**Deliverables:**

- Maintain a persistent Supabase threshold catalogue that the application reads without downloading or parsing Cambridge documents during a student request.
- Run official Cambridge publication discovery independently of student traffic on a controlled schedule; a student opening the planner must never trigger an import.
- Treat Cambridge examination series consistently:
  - February/March examinations use the March publication;
  - May/June examinations use the June publication;
  - October/November examinations use the November publication.
- Discover publication availability independently for each supported subject; a series index, particularly March, may omit subjects, and absence must not be treated as a parser or import failure for another subject.
- Use the June 2026 publications as the planned initial latest dataset for Mathematics 9709, Further Mathematics 9231, Physics 9702, Chemistry 9701, and Computer Science 9618.
- Import official Cambridge threshold documents by:
  - syllabus code;
  - examination year;
  - examination series;
  - paper/component and variant;
  - qualification option or paper combination;
  - grade;
  - maximum raw mark;
  - weighting factor only where supported by an official Cambridge source.
- Retain exact official component-variant thresholds and every valid official qualification-option or paper-combination token as separate catalogue records, even when Atlas has not yet mapped that combination to a current study route.
- Maintain explicitly reviewed planner-eligibility mappings separately from the official catalogue; only eligible mappings may expose a combination to students or use it in target calculations.
- Store the official source URL, publication date, import timestamp, document checksum, parser version, publication status, and revision lineage.
- Treat a previously imported checksum as a no-op, so repeated scheduled discovery does not create duplicate data or rewrite an existing publication.
- Preserve historical thresholds rather than overwriting them; if Cambridge changes a document at an existing URL, import it as an append-only revision and explicitly supersede the earlier revision only after validation.
- Provide an administrative validation report for every import.
- Mark missing, ambiguous, superseded, and manually reviewed data explicitly.
- Publish staged threshold data atomically only after its source, structure, value ranges, grade ordering, components, combinations, and any source-backed weightings pass validation.

**Verification checks:**

- **Source check:** Every threshold record links to an official Cambridge source.
- **Parsing check:** Imported values are compared against a manually verified sample from every supported subject and series.
- **Variant check:** Exact component variants remain identifiable and cannot be mixed accidentally.
- **Combination check:** Every valid official combination token is preserved in the catalogue, while student planner exposure requires a separate, explicitly reviewed eligible mapping to a supported Atlas subject route and paper combination.
- **Idempotency check:** Rediscovering a publication with an existing checksum performs no data write.
- **Revision check:** A changed document checksum creates a reviewable append-only revision without altering the earlier import.
- **History check:** Importing newer thresholds does not alter historical records.
- **Failure-state check:** Missing or unverified data produces “Threshold unavailable,” never an invented value.
- **Database check:** Constraints reject impossible marks, grades, duplicate records, and invalid subject-paper relationships.

---

## Milestone 4 — Target-Grade Marks Planner

**Status:** Planned

**Objective:** When a student selects a target grade, show the marks required to reach that target using the latest applicable official threshold data.

**Deliverables:**

- Match the student's target grade against:
  - subject and syllabus code;
  - AS/A2 stage;
  - selected study route;
  - paper combination;
  - examination series;
  - paper variant;
  - latest published applicable threshold.
- When an intended examination series has not yet been published, use only the newest compatible published series as a planning benchmark and disclose both the benchmark series and the unavailable intended series.
- Display the official combined raw or weighted-mark threshold and each paper's maximum mark.
- Display official component thresholds where Cambridge publishes them.
- Derive a paper-level planning benchmark by grouping supported variants of the same subject, paper, year, and series, averaging their official component threshold for the applicable component grade, and rounding the average upward to a whole raw mark. For example, Mathematics 9709 Paper 1 may average variants 11, 12, and 13; special or unsupported variants must not be included implicitly. For an A* plan, use the component A benchmarks only as the allocation starting point, then distribute the additional marks required by the official combined A* threshold.
- Use the exact official component threshold when the student's variant is known. When it is unknown, use the compatible paper-variant average and label it clearly as an **Atlas estimate**, including the variants used.
- Where only an overall option threshold exists, generate a recommended per-paper mark allocation only when an official Cambridge source supports the required component weighting; combine that weighting with the paper-level planning benchmarks, the student's demonstrated performance, and the remaining marks.
- Allow a validated official overall combination threshold to be published even when trustworthy component weighting is unavailable, but mark that combination ineligible for per-paper allocation until an official source supplies the required weighting.
- Include every compatible full-paper attempt for the applicable paper in the grade-prediction performance baseline, normalizing safely against its recorded maximum mark where necessary. Apply gradual recency weighting so newer attempts influence the recommendation more strongly without discarding older full-paper attempts.
- Exclude standalone past-year-question, topical-question, and mixed-question practice from predicted grades and official threshold comparisons, even when that practice is associated with the same paper.
- Keep the unweighted lifetime average, recency-weighted baseline, attempt count, variability, and improvement trend distinct where they are displayed or used to explain confidence.
- Label all generated allocations and paper-level A* targets as **Atlas estimates**, not official Cambridge thresholds.
- Show the threshold year, examination series, source, and last-updated date.
- Support safety margins above the threshold, such as `+3`, `+5`, or a configurable percentage.
- For staged students targeting A*, show an estimated AS contribution benchmark of `ceil(official combined A* target / 2)` until a compatible official weighted AS result is recorded.
- When a compatible official weighted AS mark is available, replace the estimated AS contribution with that actual value and calculate `remaining A2 marks required = official combined A* target - official weighted AS contribution`.
- Keep raw marks, officially weighted marks, grades, percentages, and percentage uniform marks (PUMs) as distinct data types; a grade or PUM must never be subtracted as if it were a weighted raw mark.
- Identify when the calculated remaining A2 requirement exceeds the available A2 maximum and explain that the selected target is mathematically unavailable for the supplied contribution and combination.

**Calculation rules:**

- Cambridge's official A* value applies only to an eligible overall paper combination. Never present an individual-paper A* target or the staged halfway AS benchmark as an official Cambridge component threshold.
- For a known variant, prefer its exact official component threshold. For an unknown variant, average only explicitly supported compatible variants of the same subject, paper, year, series, grade, and raw maximum, then round upward and disclose the included variants.
- Use all compatible full-paper attempts for a paper with gradual recency weighting; do not impose an arbitrary fixed-attempt cutoff.
- Keep standalone question-practice evidence out of grade prediction at the data-query boundary rather than relying on a presentation-only filter.
- A staged AS contribution estimate for an A* plan is `ceil(official combined A* target / 2)`. A compatible official weighted AS mark always replaces that estimate, whether the actual mark is above or below it.
- Retain and apply weighting factors only when supported by an official Cambridge source; never infer or invent a missing component weighting.
- Keep raw marks, weighted marks, grades, percentages, and PUMs separate throughout calculation and storage.
- Preserve full precision through weighting and allocation, round only at the final display step, and recheck that rounded targets still meet the combined requirement.
- If a student's exact variant is unknown, use the documented compatible variant average only where that grouping has been approved; never invent a route, option combination, weighting, or unsupported variant.
- If the required source, route, combination, or maximum mark is missing or ambiguous, return “Threshold unavailable” rather than guessing. If only trustworthy component weighting is unavailable, the official overall benchmark may remain visible, but per-paper allocation must be unavailable.

**Verification checks:**

- **Fixture check:** Known Cambridge examples reproduce the documented weighted and overall thresholds.
- **Route check:** Changing route, series, or variant selects the correct threshold set.
- **Allocation check:** Generated paper targets add up to the required weighted total.
- **Variant-average check:** Approved component variants are grouped correctly, averaged at the same grade and raw maximum, rounded upward, and disclosed as an Atlas estimate.
- **Attempt-history check:** Every compatible full-paper attempt contributes with the documented recency weighting while incompatible papers and maxima are excluded or normalized safely.
- **Evidence-isolation check:** Standalone question practice cannot enter a predicted grade or official threshold comparison.
- **Staged-route check:** The estimated halfway AS contribution, official weighted AS replacement, remaining A2 requirement, and impossible-target state match hand-calculated fixtures.
- **Type-safety check:** Raw marks, weighted marks, grades, percentages, and PUMs cannot be substituted for one another.
- **Boundary check:** Marks exactly below, at, and above a threshold produce the correct result.
- **Disclosure check:** Official values and generated estimates are visually and semantically distinguishable.
- **Unavailable-data check:** The planner refuses to calculate when required source data is missing.

---

## Milestone 5 — Paper Performance & Question-Practice Analytics

**Status:** Planned

**Objective:** Compare target-grade requirements with the student's actual full-paper performance while allowing individual and grouped question practice to strengthen readiness and accuracy analytics without contaminating predicted grades.

**Deliverables:**

Preserve two explicit logging paths:

- **Log full paper:** retain the existing requirement for subject, AS/A2 stage, paper, variant, examination series, year, attempt date, and total marks. These records remain eligible for predicted grades, official threshold comparisons, readiness, and accuracy analytics.
- **Log questions:** allow one question or a grouped practice session containing multiple past-year, topical, or mixed/custom questions. Require subject, AS/A2 stage, attempt date, and marks obtained/available; allow paper, variant, series, year, source label, question number, time, notes, and chapter mappings to be recorded when known without requiring them for topical practice.
- Store standalone question practice separately from `past_papers`; do not make the existing full-paper year, series, paper, or variant identity nullable to accommodate it.
- Model grouped practice as a parent practice session with one or more scored question items and normalized question-to-chapter mappings.
- Write a practice session, its question items, and its chapter mappings atomically with ownership, active-enrollment, score-boundary, and AS/A2-stage validation.

For every selected paper, show:

- Required mark for the target grade.
- Student's latest raw mark and percentage.
- Student's average raw mark and percentage across comparable attempts.
- Difference between the required mark and latest mark.
- Difference between the required mark and average mark.
- Latest attempt grade using the threshold belonging to that paper's own year, series, and variant.
- Performance trend across recent attempts.
- Suggested safety-margin target.

At subject level, show:

- Current estimated combined mark using the selected route and official weightings.
- Latest comparable grade.
- Rolling predicted grade.
- Marks still needed to reach the target.
- Strongest and weakest paper components.

For readiness and accuracy analytics:

- Include both full-paper totals and standalone question-practice marks for the accessible AS/A2 stage.
- Calculate combined assessment accuracy as `(full-paper marks obtained + standalone-question marks obtained) / (full-paper marks available + standalone-question marks available)` so a small question does not count as heavily as a complete paper.
- Count a full paper's total exactly once. Its child question breakdown contributes to chapter analytics but must not be added again to the combined assessment-accuracy numerator or denominator.
- Calculate each grouped question session's displayed accuracy from the sum of its question-item marks rather than averaging the item percentages.
- Include standalone question practice in chapter accuracy and weak-topic evidence when its chapter mappings are present.
- Extend the accuracy trend with **All practice**, **Full papers**, and **Question practice** views; distinguish full-paper and question-session points visually and display the mark-weighted average with its evidence volume.
- Keep “Papers logged,” full-paper best score, and full-paper average distinct from question-session counts and question-practice accuracy.
- Do not award paper-count, paper-grade, or best-paper achievements from standalone question practice.
- Do not change XP or streak behaviour for question practice in the first release unless those effects are separately designed and approved.

**Comparison rules:**

- Grade historical attempts using their own session's threshold.
- Use the latest applicable threshold only for forward-looking target planning.
- Generate predicted grades only from compatible full-paper attempts with the required paper, variant, series, year, and maximum-mark identity.
- Never substitute standalone question-practice accuracy for an official full-paper result, even when the practice questions came from that paper.
- Keep “latest attempt,” “rolling average,” and “predicted result” as separate metrics.
- Keep full-paper accuracy, question-practice accuracy, and combined readiness accuracy as separate explainable metrics.
- Do not present a prediction when insufficient comparable data exists.

**Verification checks:**

- **Latest-attempt check:** The most recent valid attempt is selected by attempt date.
- **Average check:** The grade-prediction calculation includes only compatible full-paper attempts and handles different maximum marks correctly.
- **Historical check:** Historical papers use historical thresholds rather than the latest threshold.
- **Weighting check:** Subject-level predictions apply the correct paper weighting.
- **Insufficient-data check:** Empty and low-sample states explain what the student must log next.
- **Accuracy check:** Hand-calculated fixtures match application output for all five subjects and study routes.
- **Question-session check:** Individual and grouped question sessions reproduce hand-calculated mark totals and session accuracy.
- **Optional-source check:** Topical practice can be recorded without invented year, series, paper, or variant data, while supplied past-year provenance is preserved.
- **Readiness-inclusion check:** Standalone question marks contribute to the correct stage's readiness and chapter accuracy.
- **No-double-count check:** Full-paper totals and their child question breakdown are never counted twice in combined accuracy.
- **Prediction-isolation check:** Adding, editing, or deleting standalone question practice cannot change a predicted grade.
- **Atomicity and ownership check:** Partial question groups cannot persist, and users cannot read or mutate another user's practice sessions or items.

---

## Milestone 6 — Adaptive Missions and Grade-Gap Analytics

**Status:** Planned

**Objective:** Convert target-grade gaps into daily revision priorities.

**Deliverables:**

- Prioritise papers and chapters with the largest target-grade deficit.
- Include required-mark gaps in mission explanations.
- Recommend revision rather than another full paper when weaknesses are concentrated in specific chapters.
- Add progress-versus-target charts and predicted-grade history.
- Preserve the existing workload cap, mission variety, and subject-diversity rules.
- Prevent thresholds from becoming the only mission-ranking signal.

**Verification checks:**

- **Relevance check:** Missions correspond to real weak papers or chapters.
- **Balance check:** No subject dominates the mission list beyond existing limits.
- **Workload check:** Daily missions remain within the promised time range.
- **Improvement check:** New paper results update gaps and future missions correctly.
- **Fallback check:** Mission generation continues when threshold data is temporarily unavailable.
- **Explanation check:** Students can understand why each target-driven mission was selected.

---

## Milestone 7 — Deeper Gamification

**Status:** Future

**Objective:** Strengthen long-term study consistency without rewarding meaningless activity.

**Candidate deliverables:**

- Achievement rarity tiers and progress hints.
- Study heatmap and consistency milestones.
- Streak shields with strict anti-abuse rules.
- Atlas Coins and cosmetic rewards.
- Seasonal revision events aligned with examination sessions.
- Study pets and optional social challenges.
- Target-grade milestones such as closing a paper gap or sustaining target-level performance.

**Verification checks:**

- **Integrity check:** Rewards come from verified study actions, not repeatable low-effort events.
- **Ledger check:** XP and currency balances always equal their transaction ledgers.
- **Undo check:** Reversed actions also reverse associated rewards.
- **Engagement check:** Pilot users show improved mission completion or revision consistency.
- **Wellbeing check:** Streaks and alerts do not punish students excessively for missed days.
- **Accessibility check:** Rewards remain understandable without colour, animation, or sound.

---

## Milestone 8 — Integrations, Social Features, and AI Guidance

**Status:** Future

**Objective:** Expand Atlas only after the core study and target-grade loop is accurate and dependable.

**Candidate deliverables:**

- Google Docs notes linking.
- Calendar integration.
- Friends, accountability groups, and leaderboards.
- AI revision planning and weak-topic guidance.
- Teacher or parent progress views.
- Humanities essay feedback.

**Verification checks:**

- **Permission check:** Every integration requests the minimum necessary access.
- **Privacy check:** Social, teacher, and parent views are opt-in and disclose only approved data.
- **AI grounding check:** AI recommendations cite Atlas data and never invent marks, thresholds, or syllabus facts.
- **Disconnect check:** Users can revoke integrations without losing unrelated Atlas data.
- **Pilot check:** Each feature demonstrates measurable study value before wider release.

---

## Milestone Completion Standard

A milestone is complete only when:

1. Its acceptance criteria are documented.
2. Automated tests pass.
3. Relevant database constraints and RLS checks pass.
4. Mobile and accessibility checks pass.
5. A preview deployment is verified.
6. Production deployment receives explicit approval.
7. Production smoke tests pass.
8. Documentation, version metadata, and release notes are updated.
9. No unresolved data-loss, threshold-accuracy, or security issue remains.

## Success Measures

Atlas should monitor whether the platform helps students study better through:

- Daily and weekly mission completion.
- Consistent study days without unhealthy pressure.
- Increased chapter completion and confidence.
- Increased past-paper frequency.
- Reduction in marks needed to reach target grades.
- Improvement in latest and rolling paper performance.
- Percentage of students performing at or above their selected target.
- Student-reported clarity about what to study next.

## Reference Documents

- [README](README.md)
- [Development Roadmap](docs/roadmap.md)
- [Architecture](docs/architecture.md)
- [Product Ideas](docs/ideas.md)
- [UI Specification](Antigravity/atlas_ui_spec.md)
- [Deployment Guide](docs/deployment.md)
