-- One row per section type and page: the admin edits "the" text of a section, never a second copy of it.
create unique index page_sections_page_type_uq on page_sections (page_id, type);
