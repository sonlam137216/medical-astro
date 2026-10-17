-- "Which treatment fits your situation" on a service's page (Figma "General Service Template"): numbered cards of
-- patient situations ("One missing tooth: Single Dental Implant & Crown"), each with an optional before/after
-- picture pair (usually X-rays) shown beside the cards when the card is chosen. A child of `services`, like the
-- treatments: a service with situations cannot be deleted until they are.
-- The pictures are a pair (both or neither, two different pictures) and cannot be deleted from Media while used.
-- They come from patients, so a shown card with pictures needs the patient's written consent, as in smile_results.
create table service_situations (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  service_id text not null references services (id) on delete restrict,
  tag text check (length(tag) <= 60),
  title text not null check (length(title) between 1 and 120),
  description text check (length(description) <= 600),
  before_image_id text references media_assets (id) on delete restrict,
  after_image_id text references media_assets (id) on delete restrict,
  consent_confirmed integer not null default 0 check (consent_confirmed in (0, 1)),
  sort_order integer not null default 0,
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  constraint service_situations_pair check ((before_image_id is null) = (after_image_id is null)),
  constraint service_situations_two_pictures check (before_image_id is null or before_image_id <> after_image_id),
  constraint service_situations_consent check (is_visible = 0 or before_image_id is null or consent_confirmed = 1)
);
create index service_situations_service_idx on service_situations (service_id, sort_order);

create trigger service_situations_set_updated_at after update on service_situations
for each row when new.updated_at is old.updated_at
BEGIN
  update service_situations set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;

-- The small heading above "Which treatment fits your situation" on this service's page ("Implant treatment
-- options"); empty: the shared heading of Page text.
alter table services add column situations_label text check (length(situations_label) <= 120);
