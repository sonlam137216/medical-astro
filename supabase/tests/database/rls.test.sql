-- Who can see and change what. Run with `npm run db:test`.
begin;
select * from no_plan();

-- Fixtures (inserted as the superuser)
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'viewer@example.test');
insert into public.admins (user_id) values ('11111111-1111-1111-1111-111111111111');

insert into public.pages (id, path, title) values ('aaaaaaaa-0000-0000-0000-000000000001', '/seeded', 'Seeded page');
insert into public.consultation_requests (id, submission_id, full_name, phone, email, service_interest, source_path)
values ('cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
        'Test Person', '+84 90 000 0000', 'person@example.test', 'Dental Implants', '/services');

-- ---------------------------------------------------------------------------
-- Structural guarantees
-- ---------------------------------------------------------------------------
-- Use OIDs (not names) so Postgres cannot evaluate privilege checks against other schemas' tables.
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0::bigint, 'row level security is enabled on every public table');

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('anon', c.oid, 'select')),
  0::bigint, 'anon has no SELECT privilege on any table');

select ok(not has_table_privilege('anon', 'public.live_revision', 'select'), 'anon cannot read the live_revision view');

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('authenticated', c.oid, 'truncate')),
  0::bigint, 'signed-in users cannot TRUNCATE any table (TRUNCATE ignores RLS)');

-- ---------------------------------------------------------------------------
-- A signed-in user who is not an admin
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

select is(public.is_admin(), false, 'a normal signed-in user is not an admin');
select is((select count(*) from public.pages), 0::bigint, 'non-admin sees no pages');
select is((select count(*) from public.consultation_requests), 0::bigint, 'non-admin sees no consultation requests');
select is((select count(*) from public.audit_logs), 0::bigint, 'non-admin sees no audit logs');
select throws_ok($$insert into public.pages (path, title) values ('/hack', 'Hack')$$, '42501', null, 'non-admin cannot create pages');
select throws_ok($$insert into public.admins (user_id) values ('22222222-2222-2222-2222-222222222222')$$, '42501', null, 'non-admin cannot make themselves admin');

reset role;

-- ---------------------------------------------------------------------------
-- An admin
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select is(public.is_admin(), true, 'an admin is recognised');
select is((select count(*) from public.pages), 1::bigint, 'admin sees pages');
select lives_ok($$insert into public.pages (path, title) values ('/about', 'About')$$, 'admin can create a page');
select lives_ok($$update public.pages set title = 'About us' where path = '/about'$$, 'admin can update a page');

select throws_ok($$insert into public.admins (user_id) values ('22222222-2222-2222-2222-222222222222')$$, '42501', null, 'admin cannot add other admins through the API');
select throws_ok($$delete from public.admins$$, '42501', null, 'admin cannot delete admins through the API');
select throws_ok($$insert into public.audit_logs (action, table_name) values ('x', 'y')$$, '42501', null, 'nobody can write audit logs directly');
select throws_ok($$delete from public.audit_logs$$, '42501', null, 'nobody can delete audit logs');

-- Audit trail for the update above
select is((select count(*) from public.audit_logs
            where table_name = 'pages' and action = 'update'
              and actor_id = '11111111-1111-1111-1111-111111111111'
              and changes -> 'new' ->> 'title' = 'About us'
              and changes -> 'old' ->> 'title' = 'About'),
          1::bigint, 'updates are audited with actor, old and new values');

-- Consultation requests
select is((select count(*) from public.consultation_requests), 1::bigint, 'admin can read consultation requests');
select throws_ok($$insert into public.consultation_requests (submission_id, full_name, phone, email)
                   values (gen_random_uuid(), 'X', '+84 90 111 1111', 'x@example.test')$$,
                 '42501', null, 'admin cannot create consultation requests (only the server can)');
select throws_ok($$update public.consultation_requests set full_name = 'Someone Else'$$,
                 '42501', null, 'submitted contact details cannot be edited');
select lives_ok($$update public.consultation_requests set status = 'in_progress', internal_note = 'called back'$$,
                'admin can change status and add a note');
select is((select handled_by from public.consultation_requests), '11111111-1111-1111-1111-111111111111'::uuid,
          'changing status records who handled the request');
select isnt((select handled_at from public.consultation_requests), null, 'changing status records when it was handled');

-- Audit never copies personal data
select is((select count(*) from public.audit_logs where table_name = 'consultation_requests' and action = 'status_change'),
          1::bigint, 'consultation status changes are audited');
select is((select count(*) from public.audit_logs
            where table_name = 'consultation_requests'
              and (changes::text ilike '%Test Person%' or changes::text ilike '%person@example.test%' or changes::text ilike '%84 90 000%')),
          0::bigint, 'audit log never contains consultation personal data');

-- Revisions are append-only for admins
select lives_ok($$insert into public.content_revisions (snapshot, content_hash, created_by)
                   values ('{"pages": []}', repeat('a', 64), '11111111-1111-1111-1111-111111111111')$$,
                'admin can create a revision');
select throws_ok($$update public.content_revisions set note = 'edited'$$, '42501', null, 'admin cannot edit a revision');
select throws_ok($$delete from public.content_revisions$$, '42501', null, 'admin cannot delete a revision');

-- Publish jobs: can queue and update, cannot delete history
select lives_ok($$insert into public.publish_jobs (revision_id, requested_by)
                   select id, '11111111-1111-1111-1111-111111111111' from public.content_revisions$$,
                'admin can queue a publish job');
select throws_ok($$delete from public.publish_jobs$$, '42501', null, 'publish job history cannot be deleted by admins');

reset role;

-- ---------------------------------------------------------------------------
-- The server, using the secret key (service_role)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select lives_ok($$insert into public.consultation_requests (submission_id, full_name, phone, email, source_path)
                  values (gen_random_uuid(), 'Server Insert', '+84 90 222 2222', 'server@example.test', '/')$$,
                'the server can store a validated consultation request');
select is((select count(*) from public.pages where path = '/seeded'), 1::bigint, 'the build (secret key) can read content');
select throws_ok($$update public.content_revisions set note = 'x'$$, 'P0001', null, 'even the secret key cannot rewrite a revision');
select is((select actor_id from public.audit_logs where table_name = 'consultation_requests' and action = 'insert' order by id desc limit 1),
          null::uuid, 'server-side changes are audited with no actor');
reset role;

-- ---------------------------------------------------------------------------
-- Anonymous visitors
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$select * from public.pages$$, '42501', null, 'anon cannot read pages');
select throws_ok($$insert into public.consultation_requests (submission_id, full_name, phone, email)
                   values (gen_random_uuid(), 'X', '+84 90 111 1111', 'x@example.test')$$,
                 '42501', null, 'anon cannot submit directly to the table (the server validates first)');
select throws_ok($$select * from public.live_revision$$, '42501', null, 'anon cannot read the live revision');
reset role;

select * from finish();
rollback;
