-- Row Level Security and privileges.
--
-- Result:
--   anon           -> no access to any table (the public site is static HTML).
--   authenticated  -> only users listed in public.admins can read or change anything.
--   service_role   -> the secret key; bypasses RLS. Server and CI only.

-- ---------------------------------------------------------------------------
-- Make sure existing objects follow the same rules as the default privileges set earlier.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere and give admins full access to content tables.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'media_assets', 'site_settings', 'navigation_items', 'pages', 'page_sections', 'services',
    'doctors', 'doctor_services', 'packages', 'package_items', 'locations', 'destinations',
    'articles', 'faqs', 'redirects'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
      t || '_admin_all', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- admins: admins can see the list; nobody can change it through the API.
-- Add or remove admins with the secret key or the SQL editor.
-- ---------------------------------------------------------------------------
alter table public.admins enable row level security;

create policy admins_select_admin on public.admins
  for select to authenticated
  using ((select public.is_admin()));

revoke insert, update, delete on public.admins from authenticated;

-- ---------------------------------------------------------------------------
-- audit_logs: read-only for admins. Rows are written only by trigger functions.
-- ---------------------------------------------------------------------------
alter table public.audit_logs enable row level security;

create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using ((select public.is_admin()));

revoke insert, update, delete on public.audit_logs from authenticated;

-- ---------------------------------------------------------------------------
-- content_revisions: admins can read and create; rows are never changed (trigger also enforces it).
-- ---------------------------------------------------------------------------
alter table public.content_revisions enable row level security;

create policy content_revisions_select_admin on public.content_revisions
  for select to authenticated
  using ((select public.is_admin()));

create policy content_revisions_insert_admin on public.content_revisions
  for insert to authenticated
  with check ((select public.is_admin()));

revoke update, delete on public.content_revisions from authenticated;

-- ---------------------------------------------------------------------------
-- publish_jobs: admins read, queue (insert) and update status. History is never deleted.
-- ---------------------------------------------------------------------------
alter table public.publish_jobs enable row level security;

create policy publish_jobs_select_admin on public.publish_jobs
  for select to authenticated
  using ((select public.is_admin()));

create policy publish_jobs_insert_admin on public.publish_jobs
  for insert to authenticated
  with check ((select public.is_admin()));

create policy publish_jobs_update_admin on public.publish_jobs
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke delete on public.publish_jobs from authenticated;

-- ---------------------------------------------------------------------------
-- consultation_requests: personal data.
--  * Inserted only by the server (secret key): no insert grant or policy for anyone else.
--  * Admins can read, change status / internal note, and delete (for data-subject requests).
--  * Submitted contact details cannot be edited, only the handling fields.
-- ---------------------------------------------------------------------------
alter table public.consultation_requests enable row level security;

create policy consultation_requests_select_admin on public.consultation_requests
  for select to authenticated
  using ((select public.is_admin()));

create policy consultation_requests_update_admin on public.consultation_requests
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy consultation_requests_delete_admin on public.consultation_requests
  for delete to authenticated
  using ((select public.is_admin()));

revoke insert, update on public.consultation_requests from authenticated;
grant update (status, internal_note) on public.consultation_requests to authenticated;
