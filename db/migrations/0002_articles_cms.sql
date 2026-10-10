-- Articles for the CMS (Travel Guide and Dental Knowledge): categories, author, clinical reviewer.
--
-- `articles` already exists (0001). It is the working copy; Publish copies the visible, complete articles into
-- the snapshot. A draft is an article with is_visible = 0. Rules that span several columns (a published article
-- needs a body, an excerpt and a date; Dental Knowledge needs a clinical reviewer; the category must be of the
-- same kind) are checked by the application when saving (src/lib/cms/articles.ts) and again when the snapshot
-- is built, because SQLite cannot add a multi-column CHECK to an existing table.

create table article_categories (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  slug text not null unique check ((slug not glob '*[^a-z0-9-]*' and slug not glob '-*' and slug not glob '*-' and slug not glob '*--*' and length(slug) between 1 and 100)),
  -- Categories belong to one kind of article: Dental Knowledge has chips (General Dentistry, ...); Travel Guide may have none.
  kind text not null check (kind in ('travel_guide', 'dental_knowledge')),
  name text not null check (length(name) between 1 and 120),
  sort_order integer not null default 0,
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index article_categories_kind_idx on article_categories (kind, sort_order);

create trigger article_categories_set_updated_at after update on article_categories
for each row when new.updated_at is old.updated_at
BEGIN
  update article_categories set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;

-- Deleting a category keeps its articles (they become uncategorised).
alter table articles add column category_id text references article_categories (id) on delete set null;
alter table articles add column author_name text check (length(author_name) <= 120);
-- "Clinically reviewed by …": free text such as 'Melatec Dental Team', or a doctor's name.
alter table articles add column reviewed_by text check (length(reviewed_by) <= 160);
alter table articles add column reviewed_on text check (reviewed_on glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');

create index articles_category_idx on articles (category_id);
