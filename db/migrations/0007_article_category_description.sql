-- A short text for the category page of the article lists (/dental-knowledge/category/<slug>): it is shown under
-- the page title and used as the search description. Empty: the page uses the text of the whole list.
alter table article_categories add column description text check (length(description) <= 500);
