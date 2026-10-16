-- A wide picture for the top banner of a service's page (/services/<slug>), separate from the card photo
-- (`image_id`, about 2:1) because the banner is much wider. Empty: the page uses the site's default banner.
alter table services add column banner_image_id text references media_assets (id) on delete restrict;
