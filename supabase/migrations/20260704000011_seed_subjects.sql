-- ============================================================
-- MIGRATION 011: Seed Data — CAIE Subjects & Chapters
-- Seeds the global subject catalog and chapters for the three
-- most popular A-Level subjects (Mathematics, Physics, Chemistry).
-- All other subjects ship with no chapters initially; additional
-- chapter seeds can be added as separate migrations.
--
-- UUID Strategy: extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'key') produces
-- deterministic UUIDs from a string key. This means re-running
-- this migration produces the same UUIDs — safe for idempotency.
-- ============================================================

-- ─── SUBJECTS ─────────────────────────────────────────────────────────────
INSERT INTO public.subjects (id, name, code, color_hex, icon, is_global)
VALUES
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709'), 'Mathematics',            '9709', '#5B7FFF', 'Calculator',   TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9231'), 'Further Mathematics',    '9231', '#7C5CFC', 'Sigma',        TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9702'), 'Physics',                '9702', '#38D9F5', 'Zap',          TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9701'), 'Chemistry',              '9701', '#12E88A', 'FlaskConical', TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9700'), 'Biology',                '9700', '#78C850', 'Leaf',         TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9618'), 'Computer Science',       '9618', '#9D6EF8', 'Code2',        TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9708'), 'Economics',              '9708', '#FFD166', 'TrendingUp',   TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9489'), 'History',                '9489', '#FF7B35', 'BookOpen',     TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9696'), 'Geography',              '9696', '#34D399', 'Globe',        TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9093'), 'English Language',       '9093', '#FF6B9D', 'Type',         TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9695'), 'English Literature',     '9695', '#F472B6', 'BookMarked',   TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9990'), 'Psychology',             '9990', '#A78BFA', 'Brain',        TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9699'), 'Sociology',              '9699', '#FCA5A5', 'Users',        TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9609'), 'Business',               '9609', '#FCD34D', 'Briefcase',    TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9706'), 'Accounting',             '9706', '#6EE7B7', 'Receipt',      TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9084'), 'Law',                    '9084', '#93C5FD', 'Scale',        TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9637'), 'Media Studies',          '9637', '#F9A8D4', 'Film',         TRUE),
  (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9281'), 'Marine Science',         '9281', '#67E8F9', 'Waves',        TRUE)
ON CONFLICT (id) DO NOTHING;


-- ─── MATHEMATICS 9709 CHAPTERS ────────────────────────────────────────────
-- Source: Cambridge International AS & A Level Mathematics 9709 syllabus
DO $$
DECLARE v_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709');
BEGIN
  -- Pure Mathematics 1 (Paper 1) — AS Level
  INSERT INTO public.chapters (subject_id, title, number, component) VALUES
    (v_id, 'Quadratics',                    1, 'Pure 1'),
    (v_id, 'Functions',                     2, 'Pure 1'),
    (v_id, 'Coordinate Geometry',           3, 'Pure 1'),
    (v_id, 'Circular Measure',              4, 'Pure 1'),
    (v_id, 'Trigonometry',                  5, 'Pure 1'),
    (v_id, 'Vectors',                       6, 'Pure 1'),
    (v_id, 'Series',                        7, 'Pure 1'),
    (v_id, 'Differentiation',               8, 'Pure 1'),
    (v_id, 'Integration',                   9, 'Pure 1')
  ON CONFLICT (subject_id, component, number) DO NOTHING;

  -- Pure Mathematics 2 (Paper 2) — AS Level
  INSERT INTO public.chapters (subject_id, title, number, component) VALUES
    (v_id, 'Algebra',                                   1, 'Pure 2'),
    (v_id, 'Logarithmic and Exponential Functions',     2, 'Pure 2'),
    (v_id, 'Trigonometry',                              3, 'Pure 2'),
    (v_id, 'Differentiation',                           4, 'Pure 2'),
    (v_id, 'Integration',                               5, 'Pure 2'),
    (v_id, 'Numerical Methods',                         6, 'Pure 2')
  ON CONFLICT (subject_id, component, number) DO NOTHING;

  -- Pure Mathematics 3 (Paper 3) — A Level
  INSERT INTO public.chapters (subject_id, title, number, component) VALUES
    (v_id, 'Algebra',                                   1, 'Pure 3'),
    (v_id, 'Logarithmic and Exponential Functions',     2, 'Pure 3'),
    (v_id, 'Trigonometry',                              3, 'Pure 3'),
    (v_id, 'Differentiation',                           4, 'Pure 3'),
    (v_id, 'Integration',                               5, 'Pure 3'),
    (v_id, 'Numerical Methods',                         6, 'Pure 3'),
    (v_id, 'Vectors',                                   7, 'Pure 3'),
    (v_id, 'Differential Equations',                    8, 'Pure 3'),
    (v_id, 'Complex Numbers',                           9, 'Pure 3')
  ON CONFLICT (subject_id, component, number) DO NOTHING;

  -- Mechanics (Paper 4)
  INSERT INTO public.chapters (subject_id, title, number, component) VALUES
    (v_id, 'Forces and Equilibrium',                    1, 'Mechanics'),
    (v_id, 'Kinematics of Motion in a Straight Line',  2, 'Mechanics'),
    (v_id, 'Momentum',                                  3, 'Mechanics'),
    (v_id, 'Newton''s Laws of Motion',                 4, 'Mechanics'),
    (v_id, 'Energy, Work and Power',                    5, 'Mechanics')
  ON CONFLICT (subject_id, component, number) DO NOTHING;

  -- Probability & Statistics 1 (Paper 5)
  INSERT INTO public.chapters (subject_id, title, number, component) VALUES
    (v_id, 'Representation of Data',                    1, 'Statistics 1'),
    (v_id, 'Permutations and Combinations',             2, 'Statistics 1'),
    (v_id, 'Probability',                               3, 'Statistics 1'),
    (v_id, 'Discrete Random Variables',                 4, 'Statistics 1'),
    (v_id, 'The Normal Distribution',                   5, 'Statistics 1')
  ON CONFLICT (subject_id, component, number) DO NOTHING;

  -- Probability & Statistics 2 (Paper 6)
  INSERT INTO public.chapters (subject_id, title, number, component) VALUES
    (v_id, 'The Poisson Distribution',                  1, 'Statistics 2'),
    (v_id, 'Linear Combinations of Random Variables',  2, 'Statistics 2'),
    (v_id, 'Continuous Random Variables',               3, 'Statistics 2'),
    (v_id, 'Sampling and Estimation',                   4, 'Statistics 2'),
    (v_id, 'Hypothesis Testing',                        5, 'Statistics 2')
  ON CONFLICT (subject_id, component, number) DO NOTHING;
END $$;


-- ─── PHYSICS 9702 CHAPTERS ────────────────────────────────────────────────
DO $$
DECLARE v_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9702');
BEGIN
  INSERT INTO public.chapters (subject_id, title, number, component) VALUES
    (v_id, 'Physical Quantities and Units',             1,  'AS Core'),
    (v_id, 'Kinematics',                                2,  'AS Core'),
    (v_id, 'Dynamics',                                  3,  'AS Core'),
    (v_id, 'Forces, Density and Pressure',              4,  'AS Core'),
    (v_id, 'Work, Energy and Power',                    5,  'AS Core'),
    (v_id, 'Deformation of Solids',                     6,  'AS Core'),
    (v_id, 'Waves and Superposition',                   7,  'AS Core'),
    (v_id, 'Electricity',                               8,  'AS Core'),
    (v_id, 'D.C. Circuits',                             9,  'AS Core'),
    (v_id, 'Nuclear Physics',                           10, 'AS Core'),
    (v_id, 'Motion in a Circle',                        1,  'A2 Core'),
    (v_id, 'Gravitational Fields',                      2,  'A2 Core'),
    (v_id, 'Temperature and Ideal Gases',               3,  'A2 Core'),
    (v_id, 'Thermodynamics',                            4,  'A2 Core'),
    (v_id, 'Oscillations',                              5,  'A2 Core'),
    (v_id, 'Electric Fields',                           6,  'A2 Core'),
    (v_id, 'Capacitance',                               7,  'A2 Core'),
    (v_id, 'Magnetic Fields and Electromagnetism',      8,  'A2 Core'),
    (v_id, 'Electromagnetic Induction',                 9,  'A2 Core'),
    (v_id, 'Alternating Currents',                      10, 'A2 Core'),
    (v_id, 'Quantum Physics',                           11, 'A2 Core'),
    (v_id, 'Nuclear Physics (A2)',                      12, 'A2 Core'),
    (v_id, 'Medical Imaging',                           1,  'A2 Applied'),
    (v_id, 'Astronomy and Cosmology',                   2,  'A2 Applied')
  ON CONFLICT (subject_id, component, number) DO NOTHING;
END $$;


-- ─── CHEMISTRY 9701 CHAPTERS ─────────────────────────────────────────────
DO $$
DECLARE v_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9701');
BEGIN
  INSERT INTO public.chapters (subject_id, title, number, component) VALUES
    (v_id, 'Atomic Structure',                          1,  'AS Physical'),
    (v_id, 'Atoms, Molecules and Stoichiometry',        2,  'AS Physical'),
    (v_id, 'Chemical Bonding',                          3,  'AS Physical'),
    (v_id, 'States of Matter',                          4,  'AS Physical'),
    (v_id, 'Chemical Energetics',                       5,  'AS Physical'),
    (v_id, 'Electrochemistry',                          6,  'AS Physical'),
    (v_id, 'Equilibria',                                7,  'AS Physical'),
    (v_id, 'Reaction Kinetics',                         8,  'AS Physical'),
    (v_id, 'The Periodic Table',                        1,  'AS Inorganic'),
    (v_id, 'Group 2',                                   2,  'AS Inorganic'),
    (v_id, 'Group 17',                                  3,  'AS Inorganic'),
    (v_id, 'Nitrogen and Sulfur',                       4,  'AS Inorganic'),
    (v_id, 'Introduction to Organic Chemistry',         1,  'AS Organic'),
    (v_id, 'Hydrocarbons',                              2,  'AS Organic'),
    (v_id, 'Halogen Compounds',                         3,  'AS Organic'),
    (v_id, 'Hydroxy Compounds',                         4,  'AS Organic'),
    (v_id, 'Carbonyl Compounds',                        5,  'AS Organic'),
    (v_id, 'Carboxylic Acids and Derivatives',          1,  'A2 Organic'),
    (v_id, 'Nitrogen Compounds',                        2,  'A2 Organic'),
    (v_id, 'Polymerisation',                            3,  'A2 Organic'),
    (v_id, 'Further Energetics',                        1,  'A2 Physical'),
    (v_id, 'Further Electrochemistry',                  2,  'A2 Physical'),
    (v_id, 'Further Equilibria',                        3,  'A2 Physical'),
    (v_id, 'Transition Elements',                       1,  'A2 Inorganic')
  ON CONFLICT (subject_id, component, number) DO NOTHING;
END $$;
