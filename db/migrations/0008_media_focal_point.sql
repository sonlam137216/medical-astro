-- Where the subject of a picture is, as a percentage from the top-left corner (0 to 100 each). The website crops
-- every picture to the frame of the place it is shown in (cards, covers, ...); this point is the part kept in view.
-- Empty: the frame's own default position is used. The application always sets or clears both together.
alter table media_assets add column focal_x integer check (focal_x between 0 and 100);
alter table media_assets add column focal_y integer check (focal_y between 0 and 100);
