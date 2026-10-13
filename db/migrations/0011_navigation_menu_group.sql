-- Drop-down menus in the main menu. Links of the main menu ('header') with the same `menu_group` text are shown
-- together in a drop-down with that name (for example "Guides"), at the place of the first of them. Empty: a
-- plain link. The other menus (top bar, footer) have no drop-downs.
alter table navigation_items add column menu_group text check (menu_group is null or (length(menu_group) between 1 and 40 and location = 'header'));
