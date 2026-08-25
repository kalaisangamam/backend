-- Run this migration in Supabase before deploying the bulk attendance endpoint.
-- It changes attendance to one record per student and date, irrespective of program.
alter table attendance drop constraint if exists attendance_student_id_program_id_date_key;
alter table attendance add constraint attendance_student_id_date_key unique (student_id, date);
