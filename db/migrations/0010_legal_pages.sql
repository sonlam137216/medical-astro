-- The legal pages of the website (Privacy Policy, Legal Disclaimer). The text is written by the clinic in the admin
-- (Content > Legal pages) and goes live with Publish; until a page is published the website has no such page.
-- `slug` is one of the two fixed addresses, so a page cannot be given an address that clashes with another page.
create table legal_pages (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  slug text not null unique check (slug in ('privacy-policy', 'legal-disclaimer')),
  title text not null check (length(title) between 1 and 200),
  -- Text in the format of the articles (src/lib/cms/articles.ts): headings, lists, bold text and links.
  body text check (length(body) <= 60000),
  seo_description text check (length(seo_description) <= 400),
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
