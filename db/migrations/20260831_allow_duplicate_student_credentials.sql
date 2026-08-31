-- Registration permits duplicate usernames and emails.
-- The application prevents reusing the same username/password pair.
alter table users drop constraint if exists users_username_key;
alter table users drop constraint if exists users_email_key;

create index if not exists idx_users_username on users(username);
create index if not exists idx_users_email on users(email);
