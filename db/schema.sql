-- =====================================================================
-- KALAI SANGAMAM - DINDIGUL
-- Supabase PostgreSQL Schema
-- Run this entire file in the Supabase SQL Editor (Project > SQL Editor)
-- =====================================================================

-- Extensions ------------------------------------------------------------
create extension if not exists "pgcrypto";

-- =====================================================================
-- USERS (auth identities for both admin and student roles)
-- =====================================================================
create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  role            text not null check (role in ('admin', 'student')),
  username        text not null unique,
  email           text unique,
  password_hash   text not null,
  status          text not null default 'active' check (status in ('active', 'inactive')),
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =====================================================================
-- STUDENTS (profile data, 1:1 with users where role = student)
-- =====================================================================
create table if not exists students (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references users(id) on delete cascade,
  student_code        text not null unique, -- human readable unique Student ID e.g. KS-2026-0001
  full_name           text not null,
  date_of_birth       date,
  gender              text,
  parent_name         text,
  parent_contact      text,
  contact_number      text,
  address             text,
  blood_group         text,
  emergency_contact   text,
  joining_date        date not null default current_date,
  program_ids         uuid[] default '{}',
  program_names       text[] default '{}',
  status              text not null default 'active' check (status in ('active', 'inactive')),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table students
  add column if not exists program_ids uuid[] default '{}';

alter table students
  add column if not exists program_names text[] default '{}';

-- =====================================================================
-- STUDENT REGISTRATION REQUESTS (public requests reviewed by admin)
-- =====================================================================
create table if not exists student_registration_requests (
  id                  uuid primary key default gen_random_uuid(),
  username            text not null,
  email               text,
  password_hash       text not null,
  full_name           text not null,
  date_of_birth       date,
  gender              text,
  parent_name         text,
  parent_contact      text,
  contact_number      text,
  blood_group         text,
  emergency_contact   text,
  joining_date        date,
  status              text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by         uuid references users(id) on delete set null,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- =====================================================================
-- CONTACT ENQUIRIES (public contact-page submissions, reviewed by admin)
-- =====================================================================
create table if not exists contact_enquiries (
  id                uuid primary key default gen_random_uuid(),
  enquiry_type      text not null check (enquiry_type in ('general', 'enrolment', 'event')),
  name              text not null,
  phone             text not null,
  email             text,
  subject           text,
  game              text,
  age               int,
  preferred_branch  text,
  event_name        text,
  message           text,
  status            text not null default 'new' check (status in ('new', 'read', 'closed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Selected during public registration and assigned when the request is approved.
alter table student_registration_requests
  add column if not exists program_id uuid references programs(id) on delete set null;

-- Multiple program enrollment support for students who join more than one course.
alter table student_registration_requests
  add column if not exists program_ids uuid[] default '{}';

alter table student_registration_requests
  add column if not exists program_names text[] default '{}';

-- =====================================================================
-- PROGRAMS (Silambam, Karate, Yoga, Skating, Archery, Hindi)
-- =====================================================================
create table if not exists programs (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  tagline           text,
  introduction      text,
  benefits          text[],            -- array of bullet points
  training_details  text,
  training_schedule text,
  levels            text[],            -- e.g. ['Level 1','Level 2','Level 3'] or belt names
  display_order     int not null default 0,
  status            text not null default 'active' check (status in ('active', 'inactive')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table programs add column if not exists tagline text;

-- =====================================================================
-- STUDENT <-> PROGRAM ENROLLMENT (student's current program/level)
-- =====================================================================
create table if not exists student_programs (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references students(id) on delete cascade,
  program_id     uuid not null references programs(id) on delete cascade,
  current_level  text,                 -- e.g. 'Level 2' or 'Yellow Belt'
  enrolled_at    date not null default current_date,
  status         text not null default 'active' check (status in ('active', 'inactive')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (student_id, program_id)
);

-- =====================================================================
-- MASTERS (Founder / Director / Head Coach / Game-wise masters)
-- Images via Cloudinary URL only
-- =====================================================================
create table if not exists masters (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  role             text not null,            -- Founder / Director / Head Coach / Master
  master_type      text not null default 'programme' check (master_type in ('leadership', 'programme')),
  programme        text,
  specialization   text,                     -- e.g. Silambam, Karate
  experience_years int,
  achievements     text,
  bio              text,
  photo_url        text,                     -- Cloudinary URL
  photo_public_id  text,                     -- Cloudinary public_id (for deletes)
  display_order    int not null default 0,
  status           text not null default 'active' check (status in ('active', 'inactive')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Kept here as well as in the dated migration so existing deployments can be
-- upgraded without recreating the table.
alter table masters add column if not exists master_type text;
alter table masters add column if not exists programme text;
update masters
set master_type = case
  when role ~* '(founder|director|head[[:space:]]*coach)' then 'leadership'
  else 'programme'
end
where master_type is null;
alter table masters alter column master_type set default 'programme';
alter table masters alter column master_type set not null;
alter table masters drop constraint if exists masters_master_type_check;
alter table masters add constraint masters_master_type_check check (master_type in ('leadership', 'programme'));

-- =====================================================================
-- ACHIEVEMENTS (animated statistics + milestones)
-- =====================================================================
create table if not exists achievements (
  id              uuid primary key default gen_random_uuid(),
  type            text not null default 'stat' check (type in ('stat', 'milestone')),
  label           text not null,      -- e.g. "Schools", "Students Trained"
  value           text not null,      -- e.g. "15+", "100+"
  year            int,                -- for milestone/timeline entries
  description     text,
  display_order   int not null default 0,
  status          text not null default 'active' check (status in ('active', 'inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =====================================================================
-- GALLERY (Cloudinary images/videos)
-- =====================================================================
create table if not exists gallery (
  id             uuid primary key default gen_random_uuid(),
  title          text,
  category       text not null,   -- Silambam / Karate / Yoga / Skating / Archery / Hindi / Training / Competitions / Events / Award Ceremony
  media_type     text not null check (media_type in ('image', 'video')),
  image_url      text,
  video_url      text,
  public_id      text,
  display_order  int not null default 0,
  status         text not null default 'active' check (status in ('active', 'inactive')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- =====================================================================
-- ANNOUNCEMENTS (shown in Hero card + Announcement section)
-- Images stored as URL/string (frontend-hosted or admin-uploaded, no Cloudinary requirement)
-- =====================================================================
create table if not exists announcements (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  description           text,
  image_url             text,
  event_date            date,
  last_date             date,
  registration_status   text default 'coming_soon' check (registration_status in ('open', 'closed', 'coming_soon')),
  registration_link     text,
  qr_code_url           text,
  contact_info          text,
  status                text not null default 'active' check (status in ('active', 'inactive')),
  show_on_hero          boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- =====================================================================
-- EVENTS (Upcoming Events)
-- =====================================================================
create table if not exists events (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  description           text,
  image_url             text,
  event_date            date not null,
  last_date             date,
  registration_status   text default 'coming_soon' check (registration_status in ('open', 'closed', 'coming_soon')),
  registration_link     text,
  qr_code_url           text,
  contact_info          text,
  show_on_hero          boolean not null default false,
  status                text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table events add column if not exists show_on_hero boolean not null default false;

-- =====================================================================
-- TESTIMONIALS
-- =====================================================================
create table if not exists testimonials (
  id             uuid primary key default gen_random_uuid(),
  student_name   text not null,
  message        text not null,
  program        text,
  designation    text,
  display_order  int not null default 0,
  status         text not null default 'active' check (status in ('active', 'inactive')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- =====================================================================
-- FAQ
-- =====================================================================
create table if not exists faqs (
  id             uuid primary key default gen_random_uuid(),
  question       text not null,
  answer         text not null,
  display_order  int not null default 0,
  status         text not null default 'active' check (status in ('active', 'inactive')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- =====================================================================
-- ATTENDANCE
-- =====================================================================
create table if not exists attendance (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references students(id) on delete cascade,
  program_id     uuid references programs(id) on delete set null,
  date           date not null,
  status         text not null check (status in ('present', 'absent', 'leave')),
  marked_by      uuid references users(id),
  created_at     timestamptz not null default now(),
  unique (student_id, date)
);

-- =====================================================================
-- FEES
-- =====================================================================
create table if not exists fees (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references students(id) on delete cascade,
  month           text not null,       -- e.g. 'August 2026'
  fee_amount      numeric(10,2) not null default 0,
  paid_amount     numeric(10,2) not null default 0,
  pending_amount  numeric(10,2) generated always as (fee_amount - paid_amount) stored,
  status          text not null default 'pending' check (status in ('paid', 'pending', 'partially_paid', 'overdue')),
  payment_date    date,
  payment_note    text,
  updated_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (student_id, month)
);

-- Individual payments applied to one monthly fee record. A student can make
-- several payments (for example, ₹500 + ₹500) against the same month.
create table if not exists fee_payments (
  id            uuid primary key default gen_random_uuid(),
  fee_id        uuid not null references fees(id) on delete cascade,
  amount        numeric(10,2) not null check (amount > 0),
  payment_date  date not null default current_date,
  payment_note  text,
  received_by   uuid references users(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- =====================================================================
-- SETTINGS (payment QR/number, site-wide config, key-value)
-- =====================================================================
create table if not exists settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Seed default payment settings
insert into settings (key, value) values
  ('payment_info', '{"upi_qr_url": "", "payment_number": "", "upi_id": ""}')
on conflict (key) do nothing;

insert into settings (key, value) values
  ('site_info', '{"academy_name": "Kalai Sangamam", "tagline": "", "flash_news": "", "address": "", "phone": "", "whatsapp": "", "email": "", "facebook": "", "instagram": "", "youtube": ""}')
on conflict (key) do nothing;

update settings
set value = jsonb_set(value, '{flash_news}', '""'::jsonb, true)
where key = 'site_info' and (value->>'flash_news') is null;

-- =====================================================================
-- INDEXES
-- =====================================================================
create index if not exists idx_students_status on students(status);
create index if not exists idx_student_registration_requests_status on student_registration_requests(status);
create index if not exists idx_contact_enquiries_created_at on contact_enquiries(created_at desc);
create index if not exists idx_contact_enquiries_status on contact_enquiries(status);
create index if not exists idx_masters_order on masters(display_order);
create index if not exists idx_gallery_order on gallery(display_order);
create index if not exists idx_gallery_category on gallery(category);
create index if not exists idx_programs_order on programs(display_order);
create index if not exists idx_achievements_order on achievements(display_order);
create index if not exists idx_events_status on events(status);
create index if not exists idx_events_date on events(event_date);
create index if not exists idx_attendance_student_date on attendance(student_id, date);
create index if not exists idx_fees_student_month on fees(student_id, month);
create index if not exists idx_fee_payments_fee_id on fee_payments(fee_id);
create index if not exists idx_testimonials_order on testimonials(display_order);
create index if not exists idx_faqs_order on faqs(display_order);

-- =====================================================================
-- updated_at auto-touch trigger
-- =====================================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['users','students','programs','student_programs','masters',
    'student_registration_requests','contact_enquiries','achievements','gallery','announcements','events',
    'testimonials','faqs','fees']
  loop
    execute format('drop trigger if exists trg_updated_at on %I;', t);
    execute format('create trigger trg_updated_at before update on %I
                     for each row execute function set_updated_at();', t);
  end loop;
end $$;
