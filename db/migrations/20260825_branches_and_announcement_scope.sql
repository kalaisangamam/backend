-- Scalable branch contacts and branch-aware flash news.
create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  map_url text,
  contact_number_1 text,
  contact_number_2 text,
  contact_number_3 text,
  email text,
  working_hours text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table announcements add column if not exists branch_id uuid references branches(id) on delete set null;
-- A null branch_id intentionally represents Common (academy-wide) news.
create index if not exists idx_branches_public_order on branches(status, display_order);
create index if not exists idx_announcements_branch_id on announcements(branch_id);

-- Preserve legacy site contact information by making it the first branch.
insert into branches (name, address, contact_number_1, email, display_order)
select coalesce(nullif(value->>'branchName', ''), 'Main Branch'),
       value->>'address', value->>'phone', value->>'email', 1
from settings
where key = 'site_info'
  and not exists (select 1 from branches);

create or replace function set_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_updated_at on branches;
create trigger trg_updated_at before update on branches for each row execute function set_updated_at();
