-- Service FAQs are authored inside each service, independently of the existing website FAQs.
-- Existing FAQs are preserved; no questions are copied or used as a fallback.
create table service_faqs (
  id text primary key default (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  service_id text not null references services (id) on delete restrict,
  question text not null check (length(trim(question)) between 1 and 300),
  answer text check (answer is null or length(answer) <= 4000),
  sort_order integer not null default 0,
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index service_faqs_service_idx on service_faqs (service_id, sort_order);

create trigger service_faqs_set_updated_at after update on service_faqs
for each row when new.updated_at is old.updated_at
BEGIN
  update service_faqs set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where id = new.id;
END;
