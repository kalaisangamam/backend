-- Structured program schedules. Existing training_schedule text is retained.
alter table programs
  add column if not exists schedule jsonb not null default '[]'::jsonb;
