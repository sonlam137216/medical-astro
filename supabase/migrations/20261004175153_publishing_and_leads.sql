-- Publishing pipeline (revisions + build jobs) and consultation requests.

-- ---------------------------------------------------------------------------
-- content_revisions: immutable snapshots of everything the public site shows.
-- The build reads one snapshot, never the working-copy tables, so a half-edited draft can never leak
-- into a build and any deploy can be reproduced.
-- ---------------------------------------------------------------------------
create table public.content_revisions (
  id uuid primary key default gen_random_uuid(),
  revision_number bigint generated always as identity unique,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_schema_version integer not null default 1 check (snapshot_schema_version >= 1),
  -- sha-256 hex of the canonical snapshot, computed by the app; lets "publish" skip no-op changes.
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  note text check (length(note) <= 500),
  -- Plain uuid, not a foreign key: ON DELETE SET NULL would be an UPDATE, which this table forbids,
  -- and it would block removing an admin account.
  created_by uuid,
  created_at timestamptz not null default now()
);

comment on table public.content_revisions is 'Immutable. Rows cannot be updated or deleted, even with the secret key.';

create index content_revisions_hash_idx on public.content_revisions (content_hash);

create trigger content_revisions_immutable
  before update or delete on public.content_revisions
  for each row execute function public.forbid_mutation();

create trigger content_revisions_audit
  after insert on public.content_revisions
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- publish_jobs: one row per attempt to deploy a revision.
-- "Approved to publish" (a revision exists) is different from "actually live" (a job reached deployed).
-- Draft = no job. Build failures leave the previously deployed version live.
-- ---------------------------------------------------------------------------
create table public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.content_revisions (id) on delete restrict,
  status text not null default 'queued'
    check (status in ('queued', 'building', 'deployed', 'failed', 'superseded')),
  requested_by uuid references auth.users (id) on delete set null,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  -- Id of the Cloudflare build / deployment, for debugging.
  deploy_ref text check (length(deploy_ref) <= 200),
  error text check (length(error) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publish_jobs_building_has_start check (status <> 'building' or started_at is not null),
  constraint publish_jobs_done_has_end check (status not in ('deployed', 'failed') or finished_at is not null),
  constraint publish_jobs_failed_has_error check (status <> 'failed' or error is not null)
);

-- Queueing rule that avoids overlapping builds: at most one running build and at most one waiting job.
-- To publish again while one is waiting, mark the waiting job 'superseded' and insert the new one.
create unique index publish_jobs_one_building on public.publish_jobs ((true)) where status = 'building';
create unique index publish_jobs_one_queued on public.publish_jobs ((true)) where status = 'queued';
create index publish_jobs_revision_idx on public.publish_jobs (revision_id);
create index publish_jobs_recent_idx on public.publish_jobs (created_at desc);

create trigger publish_jobs_set_updated_at
  before update on public.publish_jobs
  for each row execute function public.set_updated_at();

create trigger publish_jobs_audit
  after insert or update or delete on public.publish_jobs
  for each row execute function public.audit_row_change();

-- The revision that is actually live: the one from the most recent successful deploy.
create view public.live_revision
with (security_invoker = true)
as
select r.*
  from public.content_revisions r
  join public.publish_jobs j on j.revision_id = r.id
 where j.status = 'deployed'
 order by j.finished_at desc
 limit 1;

comment on view public.live_revision is 'The content_revisions row from the latest deployed publish job.';

-- ---------------------------------------------------------------------------
-- consultation_requests: leads from the website forms.
-- Rows are inserted by the server (secret key) after validation; there is no public insert policy.
-- Only the fields in the Figma forms are collected. No IP address or user agent is stored.
-- ---------------------------------------------------------------------------
create table public.consultation_requests (
  id uuid primary key default gen_random_uuid(),
  -- Random token generated when the form is rendered; a double submit hits the unique constraint.
  submission_id uuid not null unique,
  created_at timestamptz not null default now(),
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  phone text not null check (length(btrim(phone)) between 5 and 40),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  service_interest text check (length(service_interest) <= 120),
  -- Page the form was submitted from, e.g. '/services/dental-implants'.
  source_path public.url_path,
  -- Two-letter country from the Cloudflare edge (CF-IPCountry); optional.
  client_country text check (client_country ~ '^[A-Z]{2}$'),
  status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'spam')),
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  internal_note text check (length(internal_note) <= 2000),
  updated_at timestamptz not null default now()
);

comment on table public.consultation_requests is 'Personal data. Admin-only; never cache, log or copy these rows elsewhere.';

create index consultation_requests_status_idx on public.consultation_requests (status, created_at desc);

create function public.consultation_stamp_handler()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.handled_by := (select auth.uid());
    new.handled_at := now();
  end if;
  return new;
end;
$$;

create trigger consultation_requests_stamp
  before update on public.consultation_requests
  for each row execute function public.consultation_stamp_handler();

-- Audit without personal data: only ids and status transitions.
create function public.audit_consultation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, action, table_name, row_id, changes)
    values ((select auth.uid()), 'insert', tg_table_name, new.id::text, jsonb_build_object('new', jsonb_build_object('source_path', new.source_path)));
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.audit_logs (actor_id, action, table_name, row_id, changes)
      values ((select auth.uid()), 'status_change', tg_table_name, new.id::text,
              jsonb_build_object('old', jsonb_build_object('status', old.status), 'new', jsonb_build_object('status', new.status)));
    end if;
  else
    insert into public.audit_logs (actor_id, action, table_name, row_id, changes)
    values ((select auth.uid()), 'delete', tg_table_name, old.id::text, null);
  end if;
  return null;
end;
$$;

revoke all on function public.audit_consultation_change() from public;

create trigger consultation_requests_audit
  after insert or update or delete on public.consultation_requests
  for each row execute function public.audit_consultation_change();
