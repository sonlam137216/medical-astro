-- Search engine ownership checks, typed in Site details: the token of Google Search Console's
-- <meta name="google-site-verification"> tag and of Bing Webmaster Tools' <meta name="msvalidate.01"> tag.
-- The build writes the tags in the <head> of the Home page, only on indexable builds. A pasted whole tag is reduced
-- to its token when it is saved (src/lib/site-verification.ts); the CHECK keeps only the token shape.
-- Empty = no tag. Verifying with a DNS TXT record is preferred (PUBLISHING.md); these are the fallback.
alter table site_settings add column google_site_verification text
  check (google_site_verification is null or (length(google_site_verification) between 8 and 128
    and google_site_verification not glob '*[^A-Za-z0-9_-]*'));
alter table site_settings add column bing_site_verification text
  check (bing_site_verification is null or (length(bing_site_verification) between 8 and 128
    and bing_site_verification not glob '*[^A-Za-z0-9_-]*'));
