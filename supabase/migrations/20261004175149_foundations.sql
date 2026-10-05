-- Foundations: default privileges, shared domains, the single admin role, and the audit log.
--
-- Security model (see CLAUDE.md):
--  * The public site is static, so the `anon` role never needs access to any table.
--  * There is exactly one application role: admin (a row in public.admins). No editor role.
--  * Form submissions and builds use the Supabase secret key (service_role), which bypasses RLS.
--    That key must only ever live on the server / in CI secrets.

-- ---------------------------------------------------------------------------
-- Default privileges for everything created from now on by migrations (role postgres).
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public;
-- TRUNCATE, REFERENCES and TRIGGER are not subject to RLS, so never hand them to signed-in users.
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;

-- ---------------------------------------------------------------------------
-- Domains: validate shape once, reuse everywhere.
-- ---------------------------------------------------------------------------
create domain public.slug as text
  check (value ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(value) <= 100);

-- Site-relative page path: '/', '/about', '/services/dental-implants'
create domain public.url_path as text
  check (value ~ '^/([a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*)?$' and length(value) <= 200);

-- A link target. Rejects javascript:, data: and other schemes.
create domain public.link_href as text
  check (value ~ '^(/|#|https://|http://|mailto:|tel:)' and length(value) <= 500);

-- ---------------------------------------------------------------------------
-- Shared trigger functions.
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are immutable (% is not allowed)', tg_table_name, tg_op;
end;
$$;

-- ---------------------------------------------------------------------------
-- The single role: admin.
-- Nobody can add themselves: there are deliberately no INSERT/UPDATE/DELETE policies or grants for
-- signed-in users. Admins are added with the secret key or the SQL editor (see supabase/README.md).
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.admins is 'Users allowed to manage the site. The only application role.';

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Audit log. Append-only: rows are written by trigger functions running as the table owner.
-- Consultation requests are audited separately and never copy personal data here.
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  table_name text not null,
  row_id text,
  changes jsonb
);

comment on table public.audit_logs is 'Who changed what. actor_id is null for changes made with the secret key.';

create index audit_logs_at_idx on public.audit_logs (at desc);
create index audit_logs_row_idx on public.audit_logs (table_name, row_id);

create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_j jsonb;
  new_j jsonb;
  changed_old jsonb;
  changed_new jsonb;
  rid text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_j := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    new_j := to_jsonb(new);
  end if;

  rid := coalesce(new_j, old_j) ->> 'id';
  if rid is null then
    rid := coalesce(
      coalesce(new_j, old_j) ->> 'user_id',
      nullif(concat_ws(':', coalesce(new_j, old_j) ->> 'doctor_id', coalesce(new_j, old_j) ->> 'service_id'), '')
    );
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(o.key, o.value), '{}'::jsonb),
           coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb)
      into changed_old, changed_new
      from jsonb_each(old_j) o
      join jsonb_each(new_j) n on n.key = o.key
     where o.value is distinct from n.value
       and o.key <> 'updated_at';

    -- Ignore updates that only touched updated_at.
    if changed_new = '{}'::jsonb then
      return null;
    end if;
  end if;

  insert into public.audit_logs (actor_id, action, table_name, row_id, changes)
  values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    rid,
    case tg_op
      when 'INSERT' then jsonb_build_object('new', new_j)
      when 'DELETE' then jsonb_build_object('old', old_j)
      else jsonb_build_object('old', changed_old, 'new', changed_new)
    end
  );
  return null;
end;
$$;

revoke all on function public.audit_row_change() from public;

create trigger admins_audit
  after insert or update or delete on public.admins
  for each row execute function public.audit_row_change();
