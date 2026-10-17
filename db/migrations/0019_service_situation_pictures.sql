-- "Which treatment fits your situation" has one before/after picture pair per service, shown beside all its cards
-- (owner, 2026-10-17), instead of a pair per card. The pictures are two different photos from Media (they cannot
-- be deleted while used) and, as they come from patients, need the patient's written consent.
-- The per-card picture columns of service_situations (0017) are no longer used by the website; they are kept so
-- nothing saved is lost, and the first consented pair of each service is copied here.
alter table services add column situations_before_image_id text references media_assets (id) on delete restrict;
alter table services add column situations_after_image_id text references media_assets (id) on delete restrict
  check ((situations_after_image_id is null) = (situations_before_image_id is null)
    and (situations_after_image_id is null or situations_after_image_id <> situations_before_image_id));
alter table services add column situations_consent_confirmed integer not null default 0
  check (situations_consent_confirmed in (0, 1)
    and (situations_consent_confirmed = 1 or situations_before_image_id is null));

update services
set situations_before_image_id = p.before_image_id,
  situations_after_image_id = p.after_image_id,
  situations_consent_confirmed = 1
from (
  select service_id, before_image_id, after_image_id,
    row_number() over (partition by service_id order by sort_order, title) as n
  from service_situations
  where before_image_id is not null and consent_confirmed = 1
) p
where p.service_id = services.id and p.n = 1;
