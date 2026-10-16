-- Before/after picture pairs of real patients, shown as the "Results: Real Stories. Real Smiles." slider on every
-- service page (one list for all services). Each pair is two pictures from Media; a picture in a pair cannot be
-- deleted from Media while the pair exists. `title` names the pair in the admin only and is never published (it
-- may name the patient).
-- A pair can only be shown once someone has confirmed the patient's written consent to publish the photos.
create table smile_results (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  title text not null check (length(title) between 1 and 160),
  before_image_id text not null references media_assets (id) on delete restrict,
  after_image_id text not null references media_assets (id) on delete restrict,
  consent_confirmed integer not null default 0 check (consent_confirmed in (0, 1)),
  sort_order integer not null default 0,
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  constraint smile_results_two_pictures check (before_image_id <> after_image_id),
  constraint smile_results_consent check (is_visible = 0 or consent_confirmed = 1)
);
create index smile_results_order_idx on smile_results (sort_order);

create trigger smile_results_set_updated_at after update on smile_results
for each row when new.updated_at is old.updated_at
BEGIN
  update smile_results set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
