-- Melatec database on Cloudflare D1 (SQLite). Replaces the former Supabase (PostgreSQL) schema.
--
-- Security model (see CLAUDE.md):
--  * The public site is static, so no table is ever read by a visitor. There is no public database API:
--    D1 is reachable only through the Worker binding `DB` and, for builds, the Cloudflare API with a token.
--  * There is exactly one application role: admin (a row in `admins`). Every /admin request is authenticated
--    by middleware before any query runs, the database itself has no row-level security.
--  * The consultation form writes through the same binding, with no admin attached.
--
-- Conventions: ids are UUID text, timestamps are UTC ISO-8601 text ("2026-10-05T10:00:00.000Z", sorts
-- correctly as text), booleans are 0/1, arrays and objects are JSON text. The application layer
-- (src/lib/db.ts) converts these, so code sees booleans, arrays and objects.
--
-- SQLite has no regular expressions, so shape checks (slug, path, link) use GLOB. The application
-- validates the same rules first and gives friendly messages, these checks are the last line of defence.
--
-- NOTE for editors: write BEGIN and END of triggers in UPPER CASE. wrangler d1 migrations apply --remote only recognises
-- them in upper case and otherwise fails with incomplete input.

-- ---------------------------------------------------------------------------
-- The single role: admin. Accounts are created with scripts/admin-user.mjs (nobody can add themselves).
-- password_hash: "pbkdf2-sha256$<iterations>$<salt>$<hash>" (see src/lib/password.ts).
-- ---------------------------------------------------------------------------
create table admins (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  email text not null unique collate nocase check (email like '%_@_%._%' and email not like '% %' and length(email) <= 254),
  password_hash text not null check (length(password_hash) between 20 and 300),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at text
);

-- Server-side sessions. The browser holds a random token, only its SHA-256 is stored here, so a leaked
-- database cannot be used to sign in, and deleting a row signs that session out immediately.
create table admin_sessions (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  admin_id text not null references admins (id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at text not null
);
create index admin_sessions_admin_idx on admin_sessions (admin_id);
create index admin_sessions_expires_idx on admin_sessions (expires_at);

-- Who changed what. Written by the application in the same batch as the change (src/lib/db.ts).
-- actor_id is null for changes made without an admin (the consultation form). Not a foreign key: the
-- history must survive removing an admin account.
create table audit_logs (
  id integer primary key autoincrement,
  at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor_id text,
  action text not null,
  table_name text not null,
  row_id text,
  changes text check (changes is null or json_valid(changes))
);
create index audit_logs_at_idx on audit_logs (at desc);
create index audit_logs_row_idx on audit_logs (table_name, row_id);

-- ---------------------------------------------------------------------------
-- Media (metadata only, files live in Cloudflare R2). An image is stored as several WebP files of
-- different widths, r2_key is the largest and variant_widths lists every width that exists.
-- ---------------------------------------------------------------------------
create table media_assets (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  r2_key text not null unique check (length(r2_key) between 1 and 500),
  kind text not null check (kind in ('image', 'video', 'document')),
  mime_type text not null check (length(mime_type) <= 100),
  size_bytes integer not null check (size_bytes >= 0),
  width integer check (width > 0),
  height integer check (height > 0),
  -- alt_text null = not written yet (publishing is blocked), is_decorative = intentionally empty.
  alt_text text check (length(alt_text) <= 500),
  is_decorative integer not null default 0 check (is_decorative in (0, 1)),
  -- Videos are plain MP4 files in R2, the poster is shown before playback.
  poster_asset_id text references media_assets (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  -- Pixel widths of the WebP files stored for this image, ascending. Empty for non-image assets.
  variant_widths text not null default '[]' check (json_valid(variant_widths) and json_type(variant_widths) = 'array' and json_array_length(variant_widths) <= 8),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- Site-wide settings (exactly one row, id = 1) and navigation
-- ---------------------------------------------------------------------------
create table site_settings (
  id integer primary key default 1 check (id = 1),
  site_name text not null check (length(site_name) between 1 and 120),
  tagline text check (length(tagline) <= 300),
  phone_display text check (length(phone_display) <= 40),
  phone_intl text check (length(phone_intl) <= 40),
  whatsapp_url text check ((whatsapp_url glob '/*' or whatsapp_url glob '#*' or whatsapp_url glob 'https://*' or whatsapp_url glob 'http://*' or whatsapp_url glob 'mailto:*' or whatsapp_url glob 'tel:*') and length(whatsapp_url) <= 500),
  contact_email text check (contact_email like '%_@_%._%' and contact_email not like '% %' and length(contact_email) <= 254),
  address_line text check (length(address_line) <= 300),
  opening_hours text check (length(opening_hours) <= 200),
  copyright_text text check (length(copyright_text) <= 200),
  -- [{"platform": "facebook", "url": "https://..."}], validated by the application.
  social_links text not null default '[]' check (json_valid(social_links) and json_type(social_links) = 'array'),
  logo_asset_id text references media_assets (id) on delete restrict,
  logo_light_asset_id text references media_assets (id) on delete restrict,
  default_og_image_id text references media_assets (id) on delete restrict,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table navigation_items (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  location text not null check (location in ('utility', 'header', 'footer_treatment', 'footer_explore', 'footer_legal')),
  label text not null check (length(label) between 1 and 80),
  href text not null check ((href glob '/*' or href glob '#*' or href glob 'https://*' or href glob 'http://*' or href glob 'mailto:*' or href glob 'tel:*') and length(href) <= 500),
  sort_order integer not null default 0,
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index navigation_items_order_idx on navigation_items (location, sort_order);

-- ---------------------------------------------------------------------------
-- Pages and their sections. Layout is built from fixed Astro components, sections carry structured,
-- validated content. Changing a page path must also add a row to redirects.
-- ---------------------------------------------------------------------------
create table pages (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  path text not null unique check ((path glob '/*' and path not glob '*[^a-z0-9/-]*' and path not glob '*//*' and path not glob '*-/*' and path not glob '*/-*' and path not glob '*--*' and (path = '/' or path not glob '*/') and length(path) <= 200)),
  title text not null check (length(title) between 1 and 200),
  seo_title text check (length(seo_title) <= 200),
  seo_description text check (length(seo_description) <= 400),
  og_image_id text references media_assets (id) on delete restrict,
  noindex integer not null default 0 check (noindex in (0, 1)),
  is_enabled integer not null default 1 check (is_enabled in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table page_sections (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  page_id text not null references pages (id) on delete cascade,
  type text not null check (type glob '[a-z]*' and type not glob '*[^a-z0-9_]*' and length(type) <= 60),
  -- Not unique: SQLite cannot defer a unique constraint, so moving a section is done by rewriting the order.
  sort_order integer not null default 0,
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  -- Section content. The shape is defined per type by the application, bump data_version on breaking changes.
  data text not null default '{}' check (json_valid(data) and json_type(data) = 'object'),
  data_version integer not null default 1 check (data_version >= 1),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index page_sections_page_idx on page_sections (page_id, sort_order);

-- ---------------------------------------------------------------------------
-- Services, doctors, packages. Price fields are optional: never seed invented prices.
-- ---------------------------------------------------------------------------
create table services (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  slug text not null unique check ((slug not glob '*[^a-z0-9-]*' and slug not glob '-*' and slug not glob '*-' and slug not glob '*--*' and length(slug) between 1 and 100)),
  title text not null check (length(title) between 1 and 160),
  summary text check (length(summary) <= 400),
  description text,
  price_text text check (length(price_text) <= 120),
  image_id text references media_assets (id) on delete restrict,
  seo_title text check (length(seo_title) <= 200),
  seo_description text check (length(seo_description) <= 400),
  sort_order integer not null default 0,
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table doctors (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  slug text not null unique check ((slug not glob '*[^a-z0-9-]*' and slug not glob '-*' and slug not glob '*-' and slug not glob '*--*' and length(slug) between 1 and 100)),
  full_name text not null check (length(full_name) between 1 and 160),
  role_title text check (length(role_title) <= 160),
  bio text,
  -- Credentials are claims about real people: only publish what the doctor and clinic have confirmed.
  credentials text not null default '[]' check (json_valid(credentials) and json_type(credentials) = 'array'),
  languages text not null default '["English"]' check (json_valid(languages) and json_type(languages) = 'array'),
  image_id text references media_assets (id) on delete restrict,
  sort_order integer not null default 0,
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table doctor_services (
  doctor_id text not null references doctors (id) on delete cascade,
  service_id text not null references services (id) on delete cascade,
  primary key (doctor_id, service_id)
);
create index doctor_services_service_idx on doctor_services (service_id);

create table packages (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  slug text not null unique check ((slug not glob '*[^a-z0-9-]*' and slug not glob '-*' and slug not glob '*-' and slug not glob '*--*' and length(slug) between 1 and 100)),
  kind text not null check (kind in ('single_treatment', 'travel_combo')),
  service_id text references services (id) on delete set null,
  title text not null check (length(title) between 1 and 160),
  description text,
  -- Reference price. Optional: some offers are "personalised quote".
  price_amount real check (price_amount >= 0),
  currency text check (length(currency) = 3 and currency not glob '*[^A-Z]*'),
  price_conditions text check (length(price_conditions) <= 400),
  image_id text references media_assets (id) on delete restrict,
  sort_order integer not null default 0,
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  constraint packages_price_has_currency check (price_amount is null or currency is not null)
);
create index packages_kind_idx on packages (kind, sort_order);

create table package_items (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  package_id text not null references packages (id) on delete cascade,
  label text not null check (length(label) between 1 and 300),
  sort_order integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index package_items_package_idx on package_items (package_id, sort_order);

-- ---------------------------------------------------------------------------
-- Locations (clinic branches), travel destinations, articles, FAQs, redirects
-- ---------------------------------------------------------------------------
create table locations (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  slug text not null unique check ((slug not glob '*[^a-z0-9-]*' and slug not glob '-*' and slug not glob '*-' and slug not glob '*--*' and length(slug) between 1 and 100)),
  name text not null check (length(name) between 1 and 160),
  address_line text check (length(address_line) <= 300),
  directions_url text check ((directions_url glob '/*' or directions_url glob '#*' or directions_url glob 'https://*' or directions_url glob 'http://*' or directions_url glob 'mailto:*' or directions_url glob 'tel:*') and length(directions_url) <= 500),
  image_id text references media_assets (id) on delete restrict,
  sort_order integer not null default 0,
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table destinations (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  slug text not null unique check ((slug not glob '*[^a-z0-9-]*' and slug not glob '-*' and slug not glob '*-' and slug not glob '*--*' and length(slug) between 1 and 100)),
  name text not null check (length(name) between 1 and 160),
  summary text,
  image_id text references media_assets (id) on delete restrict,
  sort_order integer not null default 0,
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table articles (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  slug text not null unique check ((slug not glob '*[^a-z0-9-]*' and slug not glob '-*' and slug not glob '*-' and slug not glob '*--*' and length(slug) between 1 and 100)),
  kind text not null check (kind in ('travel_guide', 'dental_knowledge')),
  title text not null check (length(title) between 1 and 200),
  excerpt text check (length(excerpt) <= 500),
  body text,
  cover_image_id text references media_assets (id) on delete restrict,
  destination_id text references destinations (id) on delete set null,
  seo_title text check (length(seo_title) <= 200),
  seo_description text check (length(seo_description) <= 400),
  -- "YYYY-MM-DD"
  published_on text check (published_on glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index articles_kind_idx on articles (kind, published_on desc);

create table faqs (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  group_key text not null check ((group_key not glob '*[^a-z0-9-]*' and group_key not glob '-*' and group_key not glob '*-' and group_key not glob '*--*' and length(group_key) between 1 and 100)),
  question text not null check (length(question) between 1 and 300),
  -- null = answer not provided yet, do not invent medical answers.
  answer text,
  sort_order integer not null default 0,
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index faqs_group_idx on faqs (group_key, sort_order);

create table redirects (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  from_path text not null unique check ((from_path glob '/*' and from_path not glob '*[^a-z0-9/-]*' and from_path not glob '*//*' and from_path not glob '*-/*' and from_path not glob '*/-*' and from_path not glob '*--*' and (from_path = '/' or from_path not glob '*/') and length(from_path) <= 200)),
  to_path text not null check ((to_path glob '/*' or to_path glob '#*' or to_path glob 'https://*' or to_path glob 'http://*' or to_path glob 'mailto:*' or to_path glob 'tel:*') and length(to_path) <= 500),
  status_code integer not null default 301 check (status_code in (301, 302)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  constraint redirects_not_self check (from_path <> to_path)
);

-- ---------------------------------------------------------------------------
-- content_revisions: immutable snapshots of everything the public site shows. The build reads one
-- snapshot, never the working-copy tables, so a half-edited draft can never leak into a build.
-- revision_number is the rowid alias (autoincrement, never reused), id is what the rest of the system uses.
-- ---------------------------------------------------------------------------
create table content_revisions (
  revision_number integer primary key autoincrement,
  id text not null unique default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  snapshot text not null check (json_valid(snapshot) and json_type(snapshot) = 'object'),
  snapshot_schema_version integer not null default 1 check (snapshot_schema_version >= 1),
  -- sha-256 hex of the canonical snapshot, computed by the app, lets "publish" skip no-op changes.
  content_hash text not null check (length(content_hash) = 64 and content_hash not glob '*[^0-9a-f]*'),
  note text check (length(note) <= 500),
  -- Plain text, not a foreign key: removing an admin account must not touch immutable rows.
  created_by text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index content_revisions_hash_idx on content_revisions (content_hash);

create trigger content_revisions_no_update before update on content_revisions
BEGIN
  select raise(abort, 'content_revisions rows are immutable (UPDATE is not allowed)');
END;
create trigger content_revisions_no_delete before delete on content_revisions
BEGIN
  select raise(abort, 'content_revisions rows are immutable (DELETE is not allowed)');
END;

-- ---------------------------------------------------------------------------
-- publish_jobs: one row per attempt to deploy a revision. "Approved to publish" (a revision exists) is
-- different from "actually live" (a job reached deployed). Build failures leave the previous version live.
-- ---------------------------------------------------------------------------
create table publish_jobs (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  revision_id text not null references content_revisions (id) on delete restrict,
  status text not null default 'queued' check (status in ('queued', 'building', 'deployed', 'failed', 'superseded')),
  requested_by text references admins (id) on delete set null,
  queued_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at text,
  finished_at text,
  -- Id of the build run, for debugging.
  deploy_ref text check (length(deploy_ref) <= 200),
  error text check (length(error) <= 4000),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  constraint publish_jobs_building_has_start check (status <> 'building' or started_at is not null),
  constraint publish_jobs_done_has_end check (status not in ('deployed', 'failed') or finished_at is not null),
  constraint publish_jobs_failed_has_error check (status <> 'failed' or error is not null)
);

-- Queueing rule that avoids overlapping builds: at most one running build and at most one waiting job.
-- To publish again while one is waiting, mark the waiting job "superseded" and insert the new one.
create unique index publish_jobs_one_building on publish_jobs (status) where status = 'building';
create unique index publish_jobs_one_queued on publish_jobs (status) where status = 'queued';
create index publish_jobs_revision_idx on publish_jobs (revision_id);
create index publish_jobs_recent_idx on publish_jobs (created_at desc);

-- The revision that is actually live: the one from the most recent successful deploy.
create view live_revision as
select r.*
  from content_revisions r
  join publish_jobs j on j.revision_id = r.id
 where j.status = 'deployed'
 order by j.finished_at desc
 limit 1;

-- ---------------------------------------------------------------------------
-- consultation_requests: leads from the website forms. Personal data: never cache, log or copy elsewhere.
-- Inserted by the server after validation. Only the fields in the Figma forms are collected, no IP address
-- or user agent is stored.
-- ---------------------------------------------------------------------------
create table consultation_requests (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  -- Random token generated when the form is rendered, a double submit hits the unique constraint.
  submission_id text not null unique,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  phone text not null check (length(trim(phone)) between 5 and 40),
  email text not null check (email like '%_@_%._%' and email not like '% %' and length(email) <= 254),
  service_interest text check (length(service_interest) <= 120),
  -- Page the form was submitted from, e.g. "/services/dental-implants".
  source_path text check ((source_path glob '/*' and source_path not glob '*[^a-z0-9/-]*' and source_path not glob '*//*' and source_path not glob '*-/*' and source_path not glob '*/-*' and source_path not glob '*--*' and (source_path = '/' or source_path not glob '*/') and length(source_path) <= 200)),
  -- Two-letter country from the Cloudflare edge (CF-IPCountry), optional.
  client_country text check (length(client_country) = 2 and client_country not glob '*[^A-Z]*'),
  status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'spam')),
  handled_by text references admins (id) on delete set null,
  handled_at text,
  internal_note text check (length(internal_note) <= 2000),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index consultation_requests_status_idx on consultation_requests (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Keep updated_at fresh. The WHEN clause stops the trigger from re-firing itself.
-- ---------------------------------------------------------------------------
create trigger media_assets_set_updated_at after update on media_assets
for each row when new.updated_at is old.updated_at
BEGIN
  update media_assets set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
create trigger site_settings_set_updated_at after update on site_settings
for each row when new.updated_at is old.updated_at
BEGIN
  update site_settings set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
create trigger navigation_items_set_updated_at after update on navigation_items
for each row when new.updated_at is old.updated_at
BEGIN
  update navigation_items set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
create trigger pages_set_updated_at after update on pages
for each row when new.updated_at is old.updated_at
BEGIN
  update pages set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
create trigger page_sections_set_updated_at after update on page_sections
for each row when new.updated_at is old.updated_at
BEGIN
  update page_sections set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
create trigger services_set_updated_at after update on services
for each row when new.updated_at is old.updated_at
BEGIN
  update services set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
create trigger doctors_set_updated_at after update on doctors
for each row when new.updated_at is old.updated_at
BEGIN
  update doctors set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
create trigger packages_set_updated_at after update on packages
for each row when new.updated_at is old.updated_at
BEGIN
  update packages set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
create trigger package_items_set_updated_at after update on package_items
for each row when new.updated_at is old.updated_at
BEGIN
  update package_items set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
create trigger locations_set_updated_at after update on locations
for each row when new.updated_at is old.updated_at
BEGIN
  update locations set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
create trigger destinations_set_updated_at after update on destinations
for each row when new.updated_at is old.updated_at
BEGIN
  update destinations set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
create trigger articles_set_updated_at after update on articles
for each row when new.updated_at is old.updated_at
BEGIN
  update articles set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
create trigger faqs_set_updated_at after update on faqs
for each row when new.updated_at is old.updated_at
BEGIN
  update faqs set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
create trigger redirects_set_updated_at after update on redirects
for each row when new.updated_at is old.updated_at
BEGIN
  update redirects set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
create trigger publish_jobs_set_updated_at after update on publish_jobs
for each row when new.updated_at is old.updated_at
BEGIN
  update publish_jobs set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
create trigger consultation_requests_set_updated_at after update on consultation_requests
for each row when new.updated_at is old.updated_at
BEGIN
  update consultation_requests set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
