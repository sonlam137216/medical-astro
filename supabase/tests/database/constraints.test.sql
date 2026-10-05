-- Data integrity rules enforced by the database itself.
begin;
select * from no_plan();

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'admin@example.test');

-- Tests must not depend on seed data (the transaction is rolled back at the end).
delete from public.site_settings;

-- Domains and checks -------------------------------------------------------
select throws_ok($$insert into public.services (slug, title) values ('Bad Slug', 'x')$$, '23514', null, 'slugs must be lower-case kebab-case');
select throws_ok($$insert into public.pages (path, title) values ('about', 'x')$$, '23514', null, 'page paths must start with a slash');
select lives_ok($$insert into public.pages (path, title) values ('/', 'Home')$$, 'the home page path is "/"');
select throws_ok($$insert into public.navigation_items (location, label, href) values ('header', 'x', 'javascript:alert(1)')$$, '23514', null, 'javascript: links are rejected');
select throws_ok($$insert into public.navigation_items (location, label, href) values ('sidebar', 'x', '/x')$$, '23514', null, 'navigation location must be a known value');
select lives_ok($$insert into public.navigation_items (location, label, href) values ('header', 'Contact', '#consultation')$$, 'anchor links are allowed');

select lives_ok($$insert into public.pages (id, path, title) values ('aaaaaaaa-0000-0000-0000-000000000002', '/p2', 'P2')$$, 'page fixture');
select throws_ok($$insert into public.page_sections (page_id, type, data) values ('aaaaaaaa-0000-0000-0000-000000000002', 'hero', '[]')$$, '23514', null, 'section data must be a JSON object');
select throws_ok($$insert into public.page_sections (page_id, type) values ('aaaaaaaa-0000-0000-0000-000000000002', 'Bad Type')$$, '23514', null, 'section type must be snake_case');
select lives_ok($$insert into public.page_sections (page_id, type, sort_order) values ('aaaaaaaa-0000-0000-0000-000000000002', 'hero', 0), ('aaaaaaaa-0000-0000-0000-000000000002', 'faq', 1)$$, 'sections can be added');
select lives_ok($$update public.page_sections set sort_order = 1 - sort_order where page_id = 'aaaaaaaa-0000-0000-0000-000000000002'$$, 'sections can swap order inside one statement (deferred unique)');
-- The order constraint is deferred (so sections can be reordered); check it immediately for this test.
set constraints public.page_sections_order_unique immediate;
select throws_ok($$insert into public.page_sections (page_id, type, sort_order) values ('aaaaaaaa-0000-0000-0000-000000000002', 'cta', 0)$$, '23505', null, 'two sections cannot share a position');

select throws_ok($$insert into public.packages (slug, kind, title, price_amount) values ('p', 'single_treatment', 'x', 600)$$, '23514', null, 'a price needs a currency');
select lives_ok($$insert into public.packages (slug, kind, title) values ('quote-only', 'single_treatment', 'Personalised quote')$$, 'a package can have no price');
select throws_ok($$insert into public.packages (slug, kind, title, price_amount, currency) values ('p2', 'combo', 'x', 600, 'USD')$$, '23514', null, 'package kind must be a known value');
select throws_ok($$insert into public.redirects (from_path, to_path) values ('/a', '/a')$$, '23514', null, 'a redirect cannot point at itself');

select lives_ok($$insert into public.site_settings (site_name) values ('Melatec')$$, 'site settings row can be created');
select throws_ok($$insert into public.site_settings (site_name) values ('Second')$$, '23505', null, 'there can be only one site settings row');
select throws_ok($$insert into public.site_settings (id, site_name) values (false, 'Other')$$, '23514', null, 'site settings id is always true');

select throws_ok($$insert into public.media_assets (r2_key, kind, mime_type, size_bytes) values ('a.png', 'gif', 'image/png', 1)$$, '23514', null, 'media kind must be known');

-- Consultation requests ----------------------------------------------------
select lives_ok($$insert into public.consultation_requests (submission_id, full_name, phone, email)
                   values ('dddddddd-0000-0000-0000-000000000001', 'Test', '+84 90 000 0000', 'a@example.test')$$, 'a valid request is stored');
select throws_ok($$insert into public.consultation_requests (submission_id, full_name, phone, email)
                   values ('dddddddd-0000-0000-0000-000000000001', 'Test', '+84 90 000 0000', 'a@example.test')$$, '23505', null, 'double submit with the same token is rejected');
select throws_ok($$insert into public.consultation_requests (submission_id, full_name, phone, email)
                   values (gen_random_uuid(), 'Test', '+84 90 000 0000', 'not-an-email')$$, '23514', null, 'invalid email is rejected');
select throws_ok($$insert into public.consultation_requests (submission_id, full_name, phone, email)
                   values (gen_random_uuid(), '   ', '+84 90 000 0000', 'a@example.test')$$, '23514', null, 'blank name is rejected');
select throws_ok($$insert into public.consultation_requests (submission_id, full_name, phone, email)
                   values (gen_random_uuid(), 'Test', '123', 'a@example.test')$$, '23514', null, 'too-short phone is rejected');
select throws_ok($$insert into public.consultation_requests (submission_id, full_name, phone, email, status)
                   values (gen_random_uuid(), 'Test', '+84 90 000 0000', 'a@example.test', 'maybe')$$, '23514', null, 'status must be a known value');

-- Revisions and publish jobs ----------------------------------------------
select throws_ok($$insert into public.content_revisions (snapshot, content_hash) values ('{}', 'not-a-hash')$$, '23514', null, 'revision hash must be sha-256 hex');
select throws_ok($$insert into public.content_revisions (snapshot, content_hash) values ('[]', repeat('b', 64))$$, '23514', null, 'snapshot must be a JSON object');
select lives_ok($$insert into public.content_revisions (id, snapshot, content_hash, created_by)
                   values ('eeeeeeee-0000-0000-0000-000000000001', '{"v": 1}', repeat('b', 64), '11111111-1111-1111-1111-111111111111')$$, 'revision can be created');
select throws_ok($$update public.content_revisions set note = 'x'$$, 'P0001', 'content_revisions rows are immutable (UPDATE is not allowed)', 'revisions cannot be updated, even by the superuser');
select throws_ok($$delete from public.content_revisions$$, 'P0001', 'content_revisions rows are immutable (DELETE is not allowed)', 'revisions cannot be deleted, even by the superuser');
select lives_ok($$delete from auth.users where id = '11111111-1111-1111-1111-111111111111'$$, 'removing the user who created a revision is not blocked');

select lives_ok($$insert into public.publish_jobs (id, revision_id) values ('ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001')$$, 'first job is queued');
select throws_ok($$insert into public.publish_jobs (revision_id) values ('eeeeeeee-0000-0000-0000-000000000001')$$, '23505', null, 'only one queued job at a time');
select lives_ok($$update public.publish_jobs set status = 'superseded' where id = 'ffffffff-0000-0000-0000-000000000001'$$, 'a waiting job can be superseded');
select lives_ok($$insert into public.publish_jobs (id, revision_id, status, started_at) values ('ffffffff-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'building', now())$$, 'one build can run');
select lives_ok($$insert into public.publish_jobs (id, revision_id) values ('ffffffff-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000001')$$, 'a new job can wait behind a running build');
select throws_ok($$insert into public.publish_jobs (revision_id, status, started_at) values ('eeeeeeee-0000-0000-0000-000000000001', 'building', now())$$, '23505', null, 'only one build runs at a time');
select throws_ok($$insert into public.publish_jobs (revision_id, status) values ('eeeeeeee-0000-0000-0000-000000000001', 'superseded'), ('eeeeeeee-0000-0000-0000-000000000001', 'building')$$, '23514', null, 'a building job needs a start time');
select throws_ok($$update public.publish_jobs set status = 'failed' where id = 'ffffffff-0000-0000-0000-000000000002'$$, '23514', null, 'a failed job needs a finish time and an error message');

select is((select count(*) from public.live_revision), 0::bigint, 'nothing is live until a job is deployed');
select lives_ok($$update public.publish_jobs set status = 'deployed', finished_at = now() where id = 'ffffffff-0000-0000-0000-000000000002'$$, 'a build can finish');
select is((select id from public.live_revision), 'eeeeeeee-0000-0000-0000-000000000001'::uuid, 'live_revision returns the deployed revision');

select * from finish();
rollback;
