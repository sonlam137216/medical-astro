-- Google Ads settings are published with the site. Empty ID disables the integration.
alter table site_settings add column google_ads_id text
  check (google_ads_id is null or (substr(google_ads_id, 1, 3) = 'AW-'
    and length(google_ads_id) between 4 and 23
    and substr(google_ads_id, 4) not glob '*[^0-9]*'));
alter table site_settings add column google_ads_consultation_label text
  check (google_ads_consultation_label is null or (length(google_ads_consultation_label) between 1 and 100
    and google_ads_consultation_label not glob '*[^A-Za-z0-9_-]*'));
alter table site_settings add column google_ads_phone_label text
  check (google_ads_phone_label is null or (length(google_ads_phone_label) between 1 and 100
    and google_ads_phone_label not glob '*[^A-Za-z0-9_-]*'));
alter table site_settings add column google_ads_zalo_label text
  check (google_ads_zalo_label is null or (length(google_ads_zalo_label) between 1 and 100
    and google_ads_zalo_label not glob '*[^A-Za-z0-9_-]*'));
alter table site_settings add column google_ads_whatsapp_label text
  check (google_ads_whatsapp_label is null or (length(google_ads_whatsapp_label) between 1 and 100
    and google_ads_whatsapp_label not glob '*[^A-Za-z0-9_-]*'));
