# Atlas — Product Backlog & Ideas

> This document is a living product backlog. It captures future feature ideas that are **out of scope for the MVP** but worth building later. Nothing here modifies the current architecture, database, or folder structure.
>
> **Legend:** 🔴 High Priority · 🟡 Medium Priority · 🟢 Low Priority

---

## 1. Social

### Friend Requests
- **Description:** Users can send, accept, or decline friend requests to connect with other Atlas users by username or email.
- **Value:** Transforms Atlas from a solo tool into a shared revision experience. Accountability with friends significantly boosts revision consistency.
- **Difficulty:** Medium
- **Priority:** 🔴 High

---

### Friends List
- **Description:** A dedicated page showing a user's friend list with each friend's current streak, XP level, and today's mission progress.
- **Value:** Creates ambient social pressure and encouragement. Seeing a friend's progress motivates you to keep up.
- **Difficulty:** Medium
- **Priority:** 🔴 High

---

### Leaderboards
- **Description:** Weekly and all-time XP rankings across a user's friend group, their school (if applicable), and globally. Resets weekly to keep competition fresh.
- **Value:** Competitive gamification drives daily engagement. Weekly resets ensure new users are never permanently behind.
- **Difficulty:** Medium
- **Priority:** 🔴 High

---

### Guilds / Study Groups
- **Description:** Groups of up to 20 students who share a collective XP pool, group leaderboard, and group missions (e.g. "complete 50 chapters this week").
- **Value:** Encourages team accountability. Study groups are a proven revision tool; guilds formalize this digitally.
- **Difficulty:** Hard
- **Priority:** 🟡 Medium

---

### Activity Feed
- **Description:** A social feed showing recent friend activity: badge unlocks, streak milestones, new subject added, mission completed.
- **Value:** Creates a community feel and surfaces achievements for positive reinforcement.
- **Difficulty:** Medium
- **Priority:** 🟢 Low

---

### Study Challenges (Head-to-Head)
- **Description:** One-on-one 7-day challenges between two friends. First to hit a target XP or chapter completion count wins.
- **Value:** Short-burst PvP competition drives intense engagement spikes. High virality potential.
- **Difficulty:** Hard
- **Priority:** 🟡 Medium

---

## 2. AI

### AI Study Coach
- **Description:** A conversational AI assistant powered by Gemini. Students can ask questions about any topic in their subject list and receive tailored explanations, mnemonics, and examples. Context-aware of the user's syllabus and weak areas.
- **Value:** Replaces the need to context-switch to ChatGPT. An in-app tutor that knows your syllabus is dramatically more useful than a generic AI.
- **Difficulty:** Hard
- **Priority:** 🔴 High

---

### AI Revision Planner
- **Description:** Given a student's exam dates, current progress, and target grades, the AI generates a multi-week revision timetable with daily study blocks.
- **Value:** The most common student problem is not knowing *how* to plan revision at scale. AI removes the friction entirely.
- **Difficulty:** Hard
- **Priority:** 🔴 High

---

### AI Weak Topic Detection
- **Description:** After analysing past paper question attempts, the AI surfaces specific sub-topics the student consistently underperforms in and prioritises them in future missions.
- **Value:** Converts raw accuracy data into actionable, targeted revision. This is the core intelligence that separates Atlas from a spreadsheet.
- **Difficulty:** Hard
- **Priority:** 🔴 High

---

### AI-Generated Flashcards
- **Description:** From a chapter or linked Google Doc, the AI extracts key terms and generates a flashcard deck the student can review directly in Atlas.
- **Value:** Saves hours of manual flashcard creation. Tightly integrated with the existing notes system.
- **Difficulty:** Hard
- **Priority:** 🟡 Medium

---

### AI Essay Feedback
- **Description:** For humanities subjects (English, History, Economics), students paste essay responses and receive AI feedback on structure, argument quality, and mark scheme alignment.
- **Value:** Essay feedback is a bottleneck — teachers are slow, tutors are expensive. AI feedback at any time is transformative for humanities students.
- **Difficulty:** Hard
- **Priority:** 🟡 Medium

---

## 3. Gamification

### PvP Pets
- **Description:** Each user owns a study pet that grows and evolves based on XP earned. In a head-to-head challenge, pets "battle" and the higher-XP pet wins.
- **Value:** Adds a visual, emotionally resonant gamification layer. Highly shareable and a natural driver of social features.
- **Difficulty:** Hard
- **Priority:** 🟡 Medium

---

### Coins & Virtual Currency
- **Description:** Students earn Atlas Coins by completing missions, maintaining streaks, and hitting milestones. Coins are spent in the in-app shop.
- **Value:** Creates an internal economy that sustains long-term engagement and gives cosmetic rewards genuine perceived value.
- **Difficulty:** Medium
- **Priority:** 🟡 Medium

---

### Cosmetic Themes
- **Description:** A collection of purchasable or earnable UI themes — colour schemes, background textures, card styles — that personalise the Atlas dashboard.
- **Value:** Personalisation drives ownership and emotional attachment to the product. Themes are a zero-friction monetisation vector.
- **Difficulty:** Medium
- **Priority:** 🟡 Medium

---

### Seasonal Events
- **Description:** Time-limited events tied to real exam seasons (e.g. "May/June Sprint"). Special missions, limited badges, and double XP weekends.
- **Value:** Timed events are one of the most powerful re-engagement mechanisms in consumer apps. Exam season alignment is uniquely relevant for Atlas.
- **Difficulty:** Medium
- **Priority:** 🟡 Medium

---

### Streak Shields
- **Description:** Purchasable or earnable items that protect a user's streak if they miss a day. A core Duolingo mechanic.
- **Value:** Reduces the devastating streak-break demotivation that kills engagement. Increases resilience of the streak system.
- **Difficulty:** Easy
- **Priority:** 🔴 High

---

### Achievement Rarity Tiers
- **Description:** Achievements categorised as Common, Rare, Epic, and Legendary, with animated unlock sequences scaled to rarity.
- **Value:** Increases the emotional payoff of earning badges. Rare badges become social status symbols.
- **Difficulty:** Easy
- **Priority:** 🟢 Low

---

## 4. Analytics

### Revision Debt
- **Description:** A metric that calculates how far behind a student is from their target pace. Shown as a number of days or chapters "in debt."
- **Value:** Makes procrastination concrete and quantifiable. A debt framing is psychologically motivating — students want to pay it off.
- **Difficulty:** Medium
- **Priority:** 🔴 High

---

### Burn Down Chart
- **Description:** A chart showing total remaining revision work (chapters + papers) over time versus the ideal pace to reach exam day at 100% readiness.
- **Value:** Borrowed from software engineering, burn down charts give students an instant visual understanding of whether they're on track.
- **Difficulty:** Medium
- **Priority:** 🔴 High

---

### Predicted Grade
- **Description:** Based on current past paper accuracy, notes completion, and time until the exam, Atlas computes a predicted grade (A*, A, B, etc.) per subject.
- **Value:** A predicted grade is the single most motivating metric for an exam student. Seeing a predicted B when targeting an A* creates immediate urgency.
- **Difficulty:** Hard
- **Priority:** 🔴 High

---

### Study Heatmap
- **Description:** A GitHub-style contribution heatmap showing daily study activity across the past year.
- **Value:** Visual streaks and patterns give students a pride-of-ownership feeling about their consistency. Highly shareable.
- **Difficulty:** Easy
- **Priority:** 🟡 Medium

---

### Subject Readiness Radar Chart
- **Description:** A radar/spider chart showing readiness scores across all subjects simultaneously.
- **Value:** Instantly identifies the weakest subject at a glance. More intuitive than a table of numbers.
- **Difficulty:** Easy
- **Priority:** 🟡 Medium

---

### Time Spent Tracking
- **Description:** Optional session timer students can start when they begin studying. Time-per-subject and time-per-chapter are logged and visualised.
- **Value:** Quantified study time is a powerful motivator and accountability tool. Adds a new dimension to the analytics suite.
- **Difficulty:** Medium
- **Priority:** 🟡 Medium

---

## 5. Productivity

### Calendar Integration
- **Description:** Sync exam dates and daily missions to Google Calendar or Apple Calendar. Students see their study schedule inside their existing workflow.
- **Value:** Removes the friction of context-switching. Study tasks that appear in the calendar students already use are far more likely to be acted on.
- **Difficulty:** Medium
- **Priority:** 🔴 High

---

### Push Notifications
- **Description:** Daily mission reminders, streak warnings (e.g. "You have 2 hours to protect your streak"), badge unlocks, and friend activity alerts via web push.
- **Value:** Push notifications are one of the highest-ROI re-engagement tools. Streak warnings in particular drive same-day return visits.
- **Difficulty:** Medium
- **Priority:** 🔴 High

---

### Pomodoro Timer
- **Description:** A built-in focus timer (25 min study / 5 min break cycles) that awards XP upon completion and links sessions to a specific chapter or subject.
- **Value:** The Pomodoro technique is the most widely used student focus method. Integrating it directly ties study time to Atlas's gamification loop.
- **Difficulty:** Easy
- **Priority:** 🟡 Medium

---

### Offline Mode
- **Description:** Core dashboard, missions, and chapter progress are accessible offline via service workers. Changes sync when the user reconnects.
- **Value:** Students revise everywhere — libraries, trains, study halls with bad wifi. Offline reliability is essential for a serious revision tool.
- **Difficulty:** Hard
- **Priority:** 🟡 Medium

---

### Notion Integration
- **Description:** Link chapters to Notion pages instead of (or alongside) Google Docs. Sync note completion status from Notion page properties.
- **Value:** Notion is widely used by A-Level students as a revision notes platform. Offering this as an alternative to Google Docs massively broadens the addressable audience.
- **Difficulty:** Medium
- **Priority:** 🟡 Medium

---

## 6. Monetization

### Atlas Pro (Subscription)
- **Description:** A premium tier unlocking advanced analytics (predicted grades, burn down chart), AI Study Coach, unlimited subjects, and priority support.
- **Value:** Freemium-to-premium conversion is the most sustainable revenue model for a student SaaS product. Core revision tracking should remain free.
- **Difficulty:** Medium
- **Priority:** 🔴 High

---

### Cosmetic Shop
- **Description:** An in-app store where students spend earned Coins or real money on themes, pet skins, badge frames, and profile avatars.
- **Value:** Cosmetic monetisation is non-predatory and widely accepted in the student demographic. Proven in games and apps like Duolingo.
- **Difficulty:** Medium
- **Priority:** 🟡 Medium

---

### School Licences
- **Description:** A B2B licensing model where schools pay a flat annual fee for all students to access Atlas Pro features via a managed school account.
- **Value:** Unlocks enterprise revenue at scale. Schools are incentivised by measurable grade improvement. Dramatically lowers CAC vs. individual student acquisition.
- **Difficulty:** Hard
- **Priority:** 🟡 Medium

---

## 7. Teacher Features

### Teacher Dashboard
- **Description:** A read-only view of all students in a class: their readiness scores, streak status, mission completion rates, and past paper accuracy per chapter.
- **Value:** Gives teachers a real-time window into student effort between lessons. Surfaces struggling students before the exam rather than after.
- **Difficulty:** Hard
- **Priority:** 🟡 Medium

---

### Class Assignments
- **Description:** Teachers can push a mission directly to all students in a class: "Complete Chapter 5 notes by Friday."
- **Value:** Extends Atlas into the classroom workflow. Teachers become advocates and drive school-wide adoption.
- **Difficulty:** Hard
- **Priority:** 🟡 Medium

---

### Past Paper Bank Management
- **Description:** Teachers can upload past papers and mark schemes and assign them to specific students or the whole class.
- **Value:** Centralises the paper distribution process. Students receive papers via Atlas and log their attempts in the same tool.
- **Difficulty:** Hard
- **Priority:** 🟢 Low

---

## 8. Parent Features

### Parent Dashboard
- **Description:** A separate, simplified read-only view parents can access (via invite link) showing their child's streak, daily mission status, readiness score, and weekly study time.
- **Value:** Parents are major stakeholders in A-Level revision. Giving them visibility reduces nagging and replaces it with data-driven conversations.
- **Difficulty:** Medium
- **Priority:** 🟡 Medium

---

### Weekly Progress Email
- **Description:** An automated weekly email sent to a linked parent with a summary of the student's progress: streak, XP earned, missions completed, and readiness change.
- **Value:** Passive visibility for parents who won't actively check a dashboard. Email is low-friction and high-reach.
- **Difficulty:** Easy
- **Priority:** 🟡 Medium

---

### Goal Setting & Approval
- **Description:** Parents can co-set target grades and exam dates alongside their child, ensuring alignment and adding a layer of accountability.
- **Value:** Shared goal-setting between parent and student is a proven motivational technique. Atlas becomes the neutral ground for this conversation.
- **Difficulty:** Medium
- **Priority:** 🟢 Low

---

## 9. Mobile App

### Native iOS & Android App
- **Description:** A full-featured native mobile app (React Native or Swift/Kotlin) mirroring the web app with push notifications, widgets, and offline support.
- **Value:** Students revise on their phones constantly. A native app unlocks push notifications, home screen widgets, and a far superior mobile UX than a responsive web app.
- **Difficulty:** Hard
- **Priority:** 🔴 High

---

### Home Screen Widget
- **Description:** A small iOS/Android widget showing today's mission count, current streak, and readiness score — visible without opening the app.
- **Value:** Ambient awareness drives daily habit formation. The widget keeps Atlas top-of-mind throughout the day.
- **Difficulty:** Medium
- **Priority:** 🟡 Medium

---

### Apple Watch / WearOS Companion
- **Description:** A minimal watch app showing today's streak status and a one-tap "I studied today" confirmation.
- **Value:** Wearable nudges are the highest-frequency touchpoint possible. A one-tap interaction lowers the barrier to maintaining a streak to almost zero.
- **Difficulty:** Hard
- **Priority:** 🟢 Low

---

## 10. Future Integrations

### Google Classroom Integration
- **Description:** Sync class rosters, assignments, and due dates from Google Classroom directly into Atlas.
- **Value:** Google Classroom is the dominant LMS in UK schools. Deep integration would position Atlas as a companion layer on top of existing school infrastructure.
- **Difficulty:** Hard
- **Priority:** 🟡 Medium

---

### Anki Integration
- **Description:** Export chapter flashcard decks from Atlas directly into Anki, and import Anki completion data back into Atlas for XP credit.
- **Value:** Anki has a devoted A-Level student following. Bridging the two tools respects existing workflows rather than forcing students to abandon them.
- **Difficulty:** Medium
- **Priority:** 🟡 Medium

---

### Spotify / Music Integration
- **Description:** A built-in focus playlist powered by the Spotify API, with Lo-Fi, Classical, and White Noise options that auto-play when a Pomodoro session starts.
- **Value:** Music and study are deeply linked for most students. In-app audio reduces the need to context-switch to Spotify, minimising distraction.
- **Difficulty:** Medium
- **Priority:** 🟢 Low

---

### Turnitin / Plagiarism Check
- **Description:** For essay-based subjects, optionally run submitted drafts through a plagiarism and AI-detection API before final submission.
- **Value:** Academic integrity is a growing concern. Building it into the revision workflow catches issues before they reach the teacher.
- **Difficulty:** Hard
- **Priority:** 🟢 Low

---

*Last updated: 2026-07-05 · Maintained by the Atlas team.*
