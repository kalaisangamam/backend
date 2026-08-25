-- Adds explicit, data-driven master categories. Existing image files are preserved.
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
create index if not exists idx_masters_type_order on masters(master_type, display_order);
