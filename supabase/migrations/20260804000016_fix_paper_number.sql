ALTER TABLE public.past_papers DROP CONSTRAINT IF EXISTS past_papers_paper_number_check;
ALTER TABLE public.past_papers ADD CONSTRAINT past_papers_paper_number_check CHECK (paper_number BETWEEN 1 AND 99);
