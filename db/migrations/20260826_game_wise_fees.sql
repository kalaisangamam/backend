-- Make fee identity student + programme + fee month without discarding legacy data.
-- Existing rows can only be mapped automatically where a student has exactly one
-- active enrolment. Ambiguous legacy rows deliberately remain NULL for admin review.
alter table fees add column if not exists programme_id uuid references programs(id) on delete restrict;

update fees f
set programme_id = enrollment.program_id
from (
  select student_id, min(program_id) as program_id
  from student_programs
  where status = 'active'
  group by student_id
  having count(*) = 1
) enrollment
where f.student_id = enrollment.student_id and f.programme_id is null;

alter table fees drop constraint if exists fees_student_id_month_key;
alter table fees drop constraint if exists fees_student_id_programme_id_month_key;
alter table fees add constraint fees_student_id_programme_id_month_key unique (student_id, programme_id, month);

create index if not exists idx_fees_programme_month on fees(programme_id, month);

-- Review before making programme_id NOT NULL in an existing deployment:
-- select * from fees where programme_id is null;
