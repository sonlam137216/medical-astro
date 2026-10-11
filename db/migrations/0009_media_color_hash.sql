-- dominant_color: the average colour of a picture ('#rrggbb', measured in the browser at upload). The website
-- paints it behind the picture while the file loads, so there is no white flash. Empty for pictures with
-- transparency, which must not get a coloured box.
-- content_hash: SHA-256 (hex) of the original file as chosen in the browser, to notice when the same picture is
-- uploaded twice. Informational: it is not unique, because the same picture can legitimately be kept twice (for
-- example with a different description).
alter table media_assets add column dominant_color text check (dominant_color glob '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]');
alter table media_assets add column content_hash text check (length(content_hash) = 64);
create index media_assets_content_hash_idx on media_assets (content_hash);
