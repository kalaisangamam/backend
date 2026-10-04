-- Student-specific achievements are separate from public academy milestones.
create table if not exists student_achievements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  program_id uuid not null references programs(id) on delete restrict,
  achievement_date date not null,
  title text not null check (length(trim(title)) > 0),
  achievement text not null check (length(trim(achievement)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_achievements_student_date
  on student_achievements(student_id, achievement_date desc);
create index if not exists idx_student_achievements_program_date
  on student_achievements(program_id, achievement_date desc);

drop trigger if exists trg_student_achievements_updated_at on student_achievements;
create trigger trg_student_achievements_updated_at
  before update on student_achievements
  for each row execute function set_updated_at();

-- The API uses the Supabase service role key and enforces student ownership
-- in the authenticated /me endpoint. Direct client access is not permitted.
alter table student_achievements enable row level security;
