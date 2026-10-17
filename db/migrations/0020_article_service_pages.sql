-- Articles picked for the service pages: every service page (Dental Implants included) lists them under the FAQ,
-- behind the round arrow button (Figma "General Service Template"). One list for all the services.
alter table articles add column show_on_service_pages integer not null default 0 check (show_on_service_pages in (0, 1));
