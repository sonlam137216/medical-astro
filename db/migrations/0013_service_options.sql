-- The treatments of a service (for example "All-on-4" under "Dental Implants"): the price cards on the service's page
-- and, when ticked, on the Home page. A service is now a group of treatments; its own price and "what is included"
-- columns are no longer used by the website (kept so nothing already saved is lost).
-- A service with treatments cannot be deleted: its treatments have to be deleted (or moved) first.
create table service_options (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  service_id text not null references services (id) on delete restrict,
  title text not null check (length(title) between 1 and 160),
  subtitle text check (length(subtitle) <= 160),
  -- Shown exactly as written ("From $400 per tooth"); empty: no price, the card invites a quote request.
  price_text text check (length(price_text) <= 120),
  inclusions text not null default '[]' check (json_valid(inclusions) and json_type(inclusions) = 'array' and json_array_length(inclusions) <= 12),
  show_on_home integer not null default 0 check (show_on_home in (0, 1)),
  sort_order integer not null default 0,
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index service_options_service_idx on service_options (service_id, sort_order);

create trigger service_options_set_updated_at after update on service_options
for each row when new.updated_at is old.updated_at
BEGIN
  update service_options set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
