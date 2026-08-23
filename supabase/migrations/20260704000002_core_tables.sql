-- ============================================================
-- MIGRATION 002: Core Tables
-- profiles, subjects, user_subjects, chapters,
-- user_chapters, past_papers, paper_question_attempts
-- ============================================================

-- ─── PROFILES ─────────────────────────────────────────────────────────────
-- Extends auth.users. Created automatically via trigger on signup.
-- total_xp and current_level are denormalised for fast dashboard reads.
-- The xp_events table is the canonical ledger; this is the cache.

CREATE TABLE public.profiles (
  id                    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT        NOT NULL,
  full_name             TEXT,
  avatar_url            TEXT,
  school                TEXT,
  exam_session          TEXT,
  timezone              TEXT        NOT NULL DEFAULT 'UTC',
  onboarding_completed  BOOLEAN     NOT NULL DEFAULT FALSE,
  total_xp              INTEGER     NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  current_level         SMALLINT    NOT NULL DEFAULT 1 CHECK (current_level BETWEEN 1 AND 100),
  total_coins           INTEGER     NOT NULL DEFAULT 0 CHECK (total_coins >= 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT profiles_email_check CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$')
);

COMMENT ON TABLE  public.profiles            IS 'Extended user profile. Extends auth.users. total_xp is denormalised from xp_events.';
COMMENT ON COLUMN public.profiles.total_xp   IS 'Denormalised sum synced by sync_xp_to_profile trigger. Source of truth is xp_events.';
COMMENT ON COLUMN public.profiles.total_coins IS 'Stub for future coin economy.';


-- ─── SUBJECTS ─────────────────────────────────────────────────────────────
-- Global CAIE subject catalog. Seeded in migration 010.
-- is_global = false means a student created a custom subject.

CREATE TABLE public.subjects (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  code         TEXT,
  color_hex    TEXT        NOT NULL DEFAULT '#5B7FFF',
  icon         TEXT        NOT NULL DEFAULT 'BookOpen',
  is_global    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT subjects_name_not_empty    CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT subjects_color_hex_format  CHECK (color_hex ~* '^#[0-9A-Fa-f]{6}$')
);

COMMENT ON TABLE public.subjects IS 'CAIE A-Level subject catalog. Global subjects seeded; students can add custom ones.';


-- ─── USER_SUBJECTS ─────────────────────────────────────────────────────────
-- Which subjects a student is actively studying.
-- exam_date and target_grade drive the Mission Engine urgency calculations.

CREATE TABLE public.user_subjects (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id     UUID        NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  exam_date      DATE,
  target_grade   TEXT        CHECK (target_grade IN ('A*', 'A', 'B', 'C', 'D', 'E')),
  priority       SMALLINT    NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  is_archived    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_subjects_unique UNIQUE (user_id, subject_id)
);

COMMENT ON TABLE  public.user_subjects             IS 'Subjects a student is enrolled in. Priority (1-5) weights the Mission Engine scoring.';
COMMENT ON COLUMN public.user_subjects.is_archived IS 'Set true after exam date passes. Archived subjects are hidden but data is preserved.';


-- ─── CHAPTERS ─────────────────────────────────────────────────────────────
-- Syllabus chapters per subject. Seeded from official CAIE syllabuses.

CREATE TABLE public.chapters (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id   UUID        NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  number       SMALLINT    NOT NULL DEFAULT 1 CHECK (number > 0),
  component    TEXT,
  description  TEXT,
  is_global    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chapters_title_not_empty              CHECK (LENGTH(TRIM(title)) > 0),
  CONSTRAINT chapters_unique_number_per_component  UNIQUE (subject_id, component, number)
);

COMMENT ON TABLE public.chapters IS 'Syllabus chapters. component groups chapters by paper (e.g. "Pure 1", "Statistics 1").';


-- ─── USER_CHAPTERS ─────────────────────────────────────────────────────────
-- Per-student progress state for each chapter.
-- Primary input to the Mission Engine algorithm.
-- Created lazily when a student first interacts with a chapter.

CREATE TABLE public.user_chapters (
  id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID              NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chapter_id        UUID              NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  notes_status      notes_status_enum NOT NULL DEFAULT 'none',
  google_doc_url    TEXT,
  google_doc_id     TEXT,
  confidence_level  SMALLINT          CHECK (confidence_level BETWEEN 1 AND 5),
  last_reviewed_at  TIMESTAMPTZ,
  personal_notes    TEXT,
  created_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  CONSTRAINT user_chapters_unique                   UNIQUE (user_id, chapter_id),
  CONSTRAINT user_chapters_google_doc_url_format
    CHECK (google_doc_url IS NULL OR google_doc_url ~* '^https?://')
);

COMMENT ON TABLE  public.user_chapters                  IS 'Per-student chapter progress. notes_status and confidence_level are key Mission Engine inputs.';
COMMENT ON COLUMN public.user_chapters.last_reviewed_at IS 'Drives the recency_penalty in the Mission Engine. Chapters not reviewed recently score higher.';


-- ─── PAST_PAPERS ──────────────────────────────────────────────────────────
-- Each row is one completed paper attempt by a student.
-- accuracy_pct is GENERATED so it can never drift from raw scores.

CREATE TABLE public.past_papers (
  id               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID               NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id       UUID               NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  paper_code       TEXT               NOT NULL,
  year             SMALLINT           NOT NULL CHECK (year BETWEEN 1990 AND 2100),
  session          paper_session_enum NOT NULL,
  paper_number     SMALLINT           CHECK (paper_number BETWEEN 1 AND 9),
  attempted_at     DATE               NOT NULL DEFAULT CURRENT_DATE,
  score_raw        SMALLINT           NOT NULL CHECK (score_raw >= 0),
  score_max        SMALLINT           NOT NULL CHECK (score_max > 0),
  accuracy_pct     NUMERIC(5,2)       GENERATED ALWAYS AS (
                     ROUND((score_raw::NUMERIC / score_max) * 100, 2)
                   ) STORED,
  time_taken_mins  SMALLINT           CHECK (time_taken_mins > 0),
  notes            TEXT,
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT past_papers_score_valid      CHECK (score_raw <= score_max),
  CONSTRAINT past_papers_unique_attempt
    UNIQUE (user_id, paper_code, year, session, attempted_at)
);

COMMENT ON TABLE  public.past_papers             IS 'Student past paper attempts. accuracy_pct is generated from score_raw/score_max.';
COMMENT ON COLUMN public.past_papers.accuracy_pct IS 'GENERATED ALWAYS: (score_raw / score_max) * 100. Automatically consistent.';


-- ─── PAPER_QUESTION_ATTEMPTS ──────────────────────────────────────────────
-- Granular per-question breakdown of a paper attempt.
-- chapter_id tags which chapter a question tests — the primary
-- weak-topic detection signal in the Mission Engine.

CREATE TABLE public.paper_question_attempts (
  id               UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id         UUID     NOT NULL REFERENCES public.past_papers(id) ON DELETE CASCADE,
  chapter_id       UUID     REFERENCES public.chapters(id) ON DELETE SET NULL,
  question_number  TEXT     NOT NULL,
  marks_available  SMALLINT NOT NULL CHECK (marks_available > 0),
  marks_obtained   SMALLINT NOT NULL CHECK (marks_obtained >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT paper_question_marks_valid CHECK (marks_obtained <= marks_available)
);

COMMENT ON TABLE public.paper_question_attempts IS 'Per-question data. chapter_id enables per-chapter accuracy tracking for weak-topic detection.';
