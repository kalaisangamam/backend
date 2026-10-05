-- Preserve legacy parent data; new registrations use separate father and mother fields.
BEGIN;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS school_college text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS father_name text,
  ADD COLUMN IF NOT EXISTS father_contact text,
  ADD COLUMN IF NOT EXISTS father_occupation text,
  ADD COLUMN IF NOT EXISTS mother_name text,
  ADD COLUMN IF NOT EXISTS mother_contact text,
  ADD COLUMN IF NOT EXISTS mother_occupation text;

ALTER TABLE student_registration_requests
  ADD COLUMN IF NOT EXISTS school_college text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS father_name text,
  ADD COLUMN IF NOT EXISTS father_contact text,
  ADD COLUMN IF NOT EXISTS father_occupation text,
  ADD COLUMN IF NOT EXISTS mother_name text,
  ADD COLUMN IF NOT EXISTS mother_contact text,
  ADD COLUMN IF NOT EXISTS mother_occupation text;

COMMIT;
