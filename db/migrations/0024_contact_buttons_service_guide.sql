-- 1. The floating contact buttons on the right of every page (phone, Facebook, Zalo, email, WhatsApp, back to top),
--    set up in Site details. They reuse the contact details already there; Zalo is new. `contact_buttons` = 0 hides
--    the whole column.
alter table site_settings add column zalo_url text
  check (zalo_url is null or (length(zalo_url) <= 300 and (zalo_url glob 'https://?*' or zalo_url glob 'http://?*')));
alter table site_settings add column contact_buttons integer not null default 1 check (contact_buttons in (0, 1));

-- 2. The guide of a service page: one article-like text (headings, lists, pictures from Media) shown in place under
--    the FAQ when the round arrow button is pressed. Replaces the list of articles ticked "Show on the service
--    pages" (`articles.show_on_service_pages` stays, unused). Empty = no button on that service's page.
alter table services add column guide_body text
  check (guide_body is null or length(guide_body) between 1 and 20000);
