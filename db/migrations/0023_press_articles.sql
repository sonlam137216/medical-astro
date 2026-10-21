-- The cards of the Home page's "Melatec in the News" block (Figma, 2026-10-21): each is a newspaper article about
-- the clinic, shown as a picture (usually a screenshot of the article) with an optional short text, linking to the
-- article on the newspaper's site. A picture used here cannot be deleted from Media. `title` names the card in the
-- admin only and is never published.
create table press_articles (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  title text not null check (length(title) between 1 and 160),
  body text check (body is null or length(body) between 1 and 300),
  url text not null check (length(url) <= 500 and (url glob 'https://?*' or url glob 'http://?*')),
  image_id text not null references media_assets (id) on delete restrict,
  sort_order integer not null default 0,
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index press_articles_order_idx on press_articles (sort_order);

create trigger press_articles_set_updated_at after update on press_articles
for each row when new.updated_at is old.updated_at
BEGIN
  update press_articles set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
