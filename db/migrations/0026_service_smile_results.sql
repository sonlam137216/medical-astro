-- Results now belong to individual services. Keep the existing shared photos on every existing
-- service, with independent rows so future edits affect only that service. If there are no services,
-- legacy rows stay unassigned and can be assigned from the all-results admin list.
alter table smile_results add column service_id text references services (id) on delete restrict;
create index smile_results_service_idx on smile_results (service_id, sort_order);

insert into smile_results (service_id, title, before_image_id, after_image_id, consent_confirmed, sort_order, is_visible)
select s.id, r.title, r.before_image_id, r.after_image_id, r.consent_confirmed, r.sort_order, r.is_visible
from smile_results r cross join services s
where r.service_id is null and s.id <> (select id from services order by id limit 1);

update smile_results set service_id = (select id from services order by id limit 1)
where service_id is null;
