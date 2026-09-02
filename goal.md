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

The v1.2.0 UI foundation has been merged to main, deployed to production, and verified through authenticated production smoke testing; formal tag and GitHub Release closeout remain pending.

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

**Status:** Complete baseline (deployed to production; formal tag and release closeout pending)

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
- **Release check:** Preview deployment, production deployment (`9RCwZ6xAY7ohAqxNn2msJzcCXcUi`), and production smoke tests passed; formal tag and GitHub Release closeout pending.

---

## Milestone 3 — Official Grade-Threshold Data Foundation

**Status:** Planned

**Objective:** Build a trustworthy, versioned source of Cambridge grade-threshold data for the five supported subjects.

**Deliverables:**

- Import official Cambridge threshold documents by:
  - syllabus code;
  - examination year;
  - examination series;
  - paper/component and variant;
  - qualification option or paper combination;
  - grade;
  - maximum raw mark;
  - weighting factor where applicable.
- Store the official source URL, publication date, import timestamp, and document checksum.
- Preserve historical thresholds rather than overwriting them.
- Provide an administrative validation report for every import.
- Mark missing, ambiguous, superseded, and manually reviewed data explicitly.

**Verification checks:**

- **Source check:** Every threshold record links to an official Cambridge source.
- **Parsing check:** Imported values are compared against a manually verified sample from every supported subject and series.
- **Variant check:** Paper variants cannot be mixed accidentally.
- **Combination check:** Overall option thresholds map only to valid subject routes and paper combinations.
- **History check:** Re-importing newer thresholds does not alter historical records.
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
- Display the total raw-mark threshold and each paper's maximum mark.
- Display official component thresholds where Cambridge publishes them.
- Where only an overall option threshold exists, generate a recommended per-paper mark allocation based on paper weighting and remaining marks.
- Label generated allocations as **estimates**, not official Cambridge thresholds.
- Show the threshold year, examination series, source, and last-updated date.
- Support safety margins above the threshold, such as `+3`, `+5`, or a configurable percentage.

**Calculation rules:**

- Never treat an overall A* threshold as an official A* threshold for every individual paper.
- Apply official weighting factors before comparing a combined mark with an option threshold.
- Keep raw marks and percentages separate.
- Round only at the final display step.
- If the student's paper route or variant is unknown, request that information instead of guessing.

**Verification checks:**

- **Fixture check:** Known Cambridge examples reproduce the documented weighted and overall thresholds.
- **Route check:** Changing route, series, or variant selects the correct threshold set.
- **Allocation check:** Generated paper targets add up to the required weighted total.
- **Boundary check:** Marks exactly below, at, and above a threshold produce the correct result.
- **Disclosure check:** Official values and generated estimates are visually and semantically distinguishable.
- **Unavailable-data check:** The planner refuses to calculate when required source data is missing.

---

## Milestone 5 — Past-Paper Performance Comparison

**Status:** Planned

**Objective:** Compare target-grade requirements with the student's actual paper performance.

**Deliverables:**

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

**Comparison rules:**

- Grade historical attempts using their own session's threshold.
- Use the latest applicable threshold only for forward-looking target planning.
- Compare only attempts with compatible paper components and maximum marks.
- Keep “latest attempt,” “rolling average,” and “predicted result” as separate metrics.
- Do not present a prediction when insufficient comparable data exists.

**Verification checks:**

- **Latest-attempt check:** The most recent valid attempt is selected by attempt date.
- **Average check:** The calculation includes only compatible attempts and handles different maximum marks correctly.
- **Historical check:** Historical papers use historical thresholds rather than the latest threshold.
- **Weighting check:** Subject-level predictions apply the correct paper weighting.
- **Insufficient-data check:** Empty and low-sample states explain what the student must log next.
- **Accuracy check:** Hand-calculated fixtures match application output for all five subjects and study routes.

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
