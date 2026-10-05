-- Content tables for the CMS (managed by admins, read by the build through the secret key).
--
-- Working copy vs published copy:
--   These tables are the *working copy*: editing them never changes the public site. Publishing
--   copies them into an immutable row in content_revisions (next migration) and the build reads that
--   snapshot. See CLAUDE.md "Quy trình xuất bản CMS".
--
-- Language: the site is English only, so there are no locale columns.
-- Prices and claims: price fields are optional. Never seed invented prices; leave them null.

-- ---------------------------------------------------------------------------
-- Media (metadata only; files live in Cloudflare R2)
-- ---------------------------------------------------------------------------
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  r2_key text not null unique check (length(r2_key) between 1 and 500),
  kind text not null check (kind in ('image', 'video', 'document')),
  mime_type text not null check (length(mime_type) <= 100),
  size_bytes bigint not null check (size_bytes >= 0),
  width integer check (width > 0),
  height integer check (height > 0),
  -- alt_text null = not written yet (the CMS must block publishing); is_decorative = intentionally empty.
  alt_text text check (length(alt_text) <= 500),
  is_decorative boolean not null default false,
  -- Videos are plain MP4 files in R2 (no streaming service); the poster is shown before playback.
  poster_asset_id uuid references public.media_assets (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.media_assets is 'Metadata for files in R2. Use versioned object keys so replaced files bypass CDN caches.';

-- ---------------------------------------------------------------------------
-- Site-wide settings (exactly one row) and navigation
-- ---------------------------------------------------------------------------
create table public.site_settings (
  id boolean primary key default true check (id),
  site_name text not null check (length(site_name) between 1 and 120),
  tagline text check (length(tagline) <= 300),
  phone_display text check (length(phone_display) <= 40),
  phone_intl text check (length(phone_intl) <= 40),
  whatsapp_url public.link_href,
  contact_email text check (contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(contact_email) <= 254),
  address_line text check (length(address_line) <= 300),
  opening_hours text check (length(opening_hours) <= 200),
  copyright_text text check (length(copyright_text) <= 200),
  -- [{"platform": "facebook", "url": "https://..."}]; validated by the application.
  social_links jsonb not null default '[]'::jsonb check (jsonb_typeof(social_links) = 'array'),
  logo_asset_id uuid references public.media_assets (id) on delete restrict,
  logo_light_asset_id uuid references public.media_assets (id) on delete restrict,
  default_og_image_id uuid references public.media_assets (id) on delete restrict,
  updated_at timestamptz not null default now()
);

comment on table public.site_settings is 'Single row of global settings (id is always true).';

create table public.navigation_items (
  id uuid primary key default gen_random_uuid(),
  location text not null check (location in ('utility', 'header', 'footer_treatment', 'footer_explore', 'footer_legal')),
  label text not null check (length(label) between 1 and 80),
  href public.link_href not null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index navigation_items_order_idx on public.navigation_items (location, sort_order);

-- ---------------------------------------------------------------------------
-- Pages and their sections
-- Layout is built from fixed Astro components; sections carry structured, validated content.
-- ---------------------------------------------------------------------------
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  path public.url_path not null unique,
  title text not null check (length(title) between 1 and 200),
  seo_title text check (length(seo_title) <= 200),
  seo_description text check (length(seo_description) <= 400),
  og_image_id uuid references public.media_assets (id) on delete restrict,
  noindex boolean not null default false,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pages is 'One row per page. Changing path must also add a row to redirects.';

create table public.page_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  type text not null check (type ~ '^[a-z][a-z0-9_]*$' and length(type) <= 60),
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  -- Section content. The shape is defined per `type` by a Zod schema in the app; bump data_version
  -- whenever that schema changes in a breaking way.
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  data_version integer not null default 1 check (data_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deferred so a section can be moved by swapping sort_order values inside one transaction.
  constraint page_sections_order_unique unique (page_id, sort_order) deferrable initially deferred
);

create index page_sections_page_idx on public.page_sections (page_id);

-- ---------------------------------------------------------------------------
-- Services, doctors, packages
-- ---------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug public.slug not null unique,
  title text not null check (length(title) between 1 and 160),
  summary text check (length(summary) <= 400),
  description text,
  price_text text check (length(price_text) <= 120),
  image_id uuid references public.media_assets (id) on delete restrict,
  seo_title text check (length(seo_title) <= 200),
  seo_description text check (length(seo_description) <= 400),
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  slug public.slug not null unique,
  full_name text not null check (length(full_name) between 1 and 160),
  role_title text check (length(role_title) <= 160),
  bio text,
  credentials text[] not null default '{}',
  languages text[] not null default array['English'],
  image_id uuid references public.media_assets (id) on delete restrict,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.doctors is 'Credentials are claims about real people: only publish what the doctor and clinic have confirmed.';

create table public.doctor_services (
  doctor_id uuid not null references public.doctors (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  primary key (doctor_id, service_id)
);

create index doctor_services_service_idx on public.doctor_services (service_id);

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  slug public.slug not null unique,
  kind text not null check (kind in ('single_treatment', 'travel_combo')),
  service_id uuid references public.services (id) on delete set null,
  title text not null check (length(title) between 1 and 160),
  description text,
  -- Reference price. Optional: some offers are "personalised quote".
  price_amount numeric(12, 2) check (price_amount >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  price_conditions text check (length(price_conditions) <= 400),
  image_id uuid references public.media_assets (id) on delete restrict,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packages_price_has_currency check (price_amount is null or currency is not null)
);

create index packages_kind_idx on public.packages (kind, sort_order);

create table public.package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages (id) on delete cascade,
  label text not null check (length(label) between 1 and 300),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index package_items_package_idx on public.package_items (package_id, sort_order);

-- ---------------------------------------------------------------------------
-- Locations (clinic branches), travel destinations, articles, FAQs, redirects
-- ---------------------------------------------------------------------------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  slug public.slug not null unique,
  name text not null check (length(name) between 1 and 160),
  address_line text check (length(address_line) <= 300),
  directions_url public.link_href,
  image_id uuid references public.media_assets (id) on delete restrict,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.locations is 'Clinic branches (Ha Noi, Lao Cai, Hai Phong ...).';

create table public.destinations (
  id uuid primary key default gen_random_uuid(),
  slug public.slug not null unique,
  name text not null check (length(name) between 1 and 160),
  summary text,
  image_id uuid references public.media_assets (id) on delete restrict,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.destinations is 'Travel destinations shown with dental packages (e.g. Da Nang).';

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  slug public.slug not null unique,
  kind text not null check (kind in ('travel_guide', 'dental_knowledge')),
  title text not null check (length(title) between 1 and 200),
  excerpt text check (length(excerpt) <= 500),
  body text,
  cover_image_id uuid references public.media_assets (id) on delete restrict,
  destination_id uuid references public.destinations (id) on delete set null,
  seo_title text check (length(seo_title) <= 200),
  seo_description text check (length(seo_description) <= 400),
  published_on date,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index articles_kind_idx on public.articles (kind, published_on desc);

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  group_key public.slug not null,
  question text not null check (length(question) between 1 and 300),
  -- null = answer not provided yet (the design only had questions); do not invent medical answers.
  answer text,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index faqs_group_idx on public.faqs (group_key, sort_order);

create table public.redirects (
  id uuid primary key default gen_random_uuid(),
  from_path public.url_path not null unique,
  to_path public.link_href not null,
  status_code integer not null default 301 check (status_code in (301, 302)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint redirects_not_self check (from_path <> to_path)
);

-- ---------------------------------------------------------------------------
-- Standard triggers: keep updated_at fresh and write the audit log.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'media_assets', 'site_settings', 'navigation_items', 'pages', 'page_sections', 'services',
    'doctors', 'packages', 'package_items', 'locations', 'destinations', 'articles', 'faqs', 'redirects'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;

  foreach t in array array[
    'media_assets', 'site_settings', 'navigation_items', 'pages', 'page_sections', 'services',
    'doctors', 'doctor_services', 'packages', 'package_items', 'locations', 'destinations',
    'articles', 'faqs', 'redirects'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
      t || '_audit', t);
  end loop;
end;
$$;
