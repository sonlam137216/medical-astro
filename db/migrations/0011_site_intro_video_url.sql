-- The Home page video can also be a YouTube or Vimeo link ("Watch video"), typed in Site details next to the
-- MP4 choice. The address is checked when it is saved (src/lib/video-embed.ts); the CHECK only keeps it sane.
-- Empty = no link; when both a link and an MP4 are set, the link is shown.
alter table site_settings add column intro_video_url text
  check (intro_video_url is null or (length(intro_video_url) between 1 and 300 and intro_video_url like 'https://%'));
