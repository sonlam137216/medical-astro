-- The slides of the Home page's "Smile transformations: Real Stories. Real Smiles." block: each slide is a short
-- story (formatted text in the article format of src/lib/cms/articles.ts, without pictures) and a before/after
-- pair of pictures from Media. A picture used here cannot be deleted from Media. `title` names the slide in the
-- admin only and is never published (it may name the patient). Separate from smile_results (service pages): the
-- Home slider uses another picture frame and carries text.
create table smile_stories (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  title text not null check (length(title) between 1 and 160),
  body text not null check (length(body) between 1 and 3000),
  before_image_id text not null references media_assets (id) on delete restrict,
  after_image_id text not null references media_assets (id) on delete restrict,
  sort_order integer not null default 0,
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  constraint smile_stories_two_pictures check (before_image_id <> after_image_id)
);
create index smile_stories_order_idx on smile_stories (sort_order);

create trigger smile_stories_set_updated_at after update on smile_stories
for each row when new.updated_at is old.updated_at
BEGIN
  update smile_stories set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;

-- The story written in Page text ("Home: smile transformation") before the slides existed becomes the first slide,
-- when it has both pictures: its paragraph, then its details heading and points as a list.
insert into smile_stories (title, body, before_image_id, after_image_id, sort_order, is_visible)
select
  'Story from Page text',
  substr(
    trim(coalesce(json_extract(s.data, '$.summary'), ''))
    || case
      when json_array_length(coalesce(json_extract(s.data, '$.details'), '[]')) > 0 then
        char(10) || char(10)
        || case
          when trim(coalesce(json_extract(s.data, '$.detailsTitle'), '')) <> ''
            then '### ' || trim(json_extract(s.data, '$.detailsTitle')) || char(10)
          else ''
        end
        || (select group_concat('- ' || d.value, char(10)) from json_each(s.data, '$.details') d)
      else ''
    end,
    1,
    3000
  ),
  json_extract(s.data, '$.before'),
  json_extract(s.data, '$.after'),
  0,
  s.is_visible
from page_sections s
where s.type = 'home_smile'
  and json_valid(s.data)
  and trim(coalesce(json_extract(s.data, '$.summary'), '')) <> ''
  and json_extract(s.data, '$.before') <> json_extract(s.data, '$.after')
  and exists (select 1 from media_assets m where m.id = json_extract(s.data, '$.before'))
  and exists (select 1 from media_assets m where m.id = json_extract(s.data, '$.after'));
