-- The video of the Home page ("Watch video"): one MP4 from the media library, chosen in Site details.
-- Nothing chosen = the Home page shows no video button and no player. A video that is in use cannot be deleted.
alter table site_settings add column intro_video_id text references media_assets (id) on delete restrict;
