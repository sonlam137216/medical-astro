-- A picture for the top banner of each built-in page (Pages in the admin), so every page can have its own instead
-- of the Home picture. Empty: the page uses the built-in banner picture.
alter table pages add column hero_image_id text references media_assets (id) on delete restrict;
