# Google Ads measurement

The public Astro pages support a Google Ads (`AW-…`) tag and four separate conversion actions. Configure them in **Admin → Site details → Google Ads measurement**, then **Save → Publish**. An empty ID disables this integration. Conversion labels left empty do not fire. Only builds with `SITE_INDEXABLE=true` and `SITE_URL` enable it; the browser also checks the configured origin. It is excluded from admin pages and the 404 page.

## First deployment

1. Apply migration `0028_google_ads.sql` before deploying the new admin. The live site currently uses the **staging** Cloudflare target (`npm run db:migrate:staging` / `npm run deploy:staging`); see `PUBLISHING.md`. Do not run the root/default migration against the live site.
2. In Google Ads, create website conversion actions and choose manual event setup. Use the conversion ID (`AW-123456789`) and each action’s Conversion Label from tag setup. If the snippet says `send_to: 'AW-123456789/AbCdEf'`, enter `AW-123456789` in the ID field and `AbCdEf` in the corresponding label field. Labels in this configuration must belong to that same AW account.
3. Enter the ID and labels in Site details, save, and publish. Use separate actions/labels for the four rows below. Leave unused labels empty. Do not also install the same conversion actions through GTM or import duplicate GA4 events.
4. Verify on the live origin with Google Tag Assistant, including its CSP diagnostics. Accept Google Ads measurement to load the tag. Open Google Ads conversion diagnostics afterwards; a real ad-attributed conversion is needed to validate attribution in reporting.

| Setting               | Trigger                                                                           | Suggested goal setup             |
| --------------------- | --------------------------------------------------------------------------------- | -------------------------------- |
| Consultation received | API confirms the consultation is saved (or the same receipt was previously saved) | Primary lead action, Count = One |
| Phone click           | Click on a `tel:` link                                                            | Secondary action                 |
| Zalo click            | Click on a supported HTTPS Zalo link                                              | Secondary action                 |
| WhatsApp click        | Click on a supported HTTPS WhatsApp link                                          | Secondary action                 |

Contact clicks measure intent, not a completed call, message, booking or sale. Failed validation, failed saves, Turnstile failures and honeypot replies do not trigger a lead. Submissions without JavaScript still work but do not send browser conversions. The saved submission’s opaque UUID becomes `transaction_id` for retry deduplication; no monetary value is invented. Google’s Count setting and Primary/Secondary goals are configured in Google Ads, not by this website.

## Visitor choice and data

This integration uses basic consent mode: no Google script or conversion is sent before acceptance. Decline is remembered, as is acceptance, in `melatec-google-ads-consent-v1` localStorage. The **Ad measurement settings** button below the footer reopens the choice. With blocked browser storage the choice lasts for the page only. Events before acceptance are not replayed. Revoking consent updates the Google consent state and reloads the page to unload the tag; existing cookies may remain but this integration will not read them again without acceptance.

The choice controls **Google Ads only**. The pre-existing Meta Pixel and Cloudflare analytics retain their existing behavior. Banner wording states this scope. Personalization remains denied; this integration does not enable enhanced conversions or send form fields, service interests, contact destinations or monetary values. The configured page URL keeps only the pathname and allowlisted `gclid`, `gbraid`, `wbraid` attribution parameters, and the referrer is reduced to its origin. Browsers, ad blockers and denied consent can reduce measured conversions.

The CSP allows Google’s documented script/image/connect/frame origins without permitting arbitrary inline scripts. Regional Google endpoints require explicitly adding their domains in `astro.config.mjs` if Tag Assistant identifies them for the target market.

## Local verification

`npm test`, `npm run check`, `npm run lint`, and a build validate the integration. `node scripts/check-google-ads.mjs` runs browser scenarios with a fixture page, the actual bundled scripts and the built CSP; external tag requests and form responses are mocked, so tests never create Google Ads conversions or real consultations.

Official references: [Google Ads tag setup](https://support.google.com/google-ads/answer/7548399), [basic consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode), [Google tag CSP endpoints](https://developers.google.com/tag-platform/security/guides/csp).

## Deployment verification — 29 October 2026

Deployed to `melatecdentalclinic.com` (Worker `melatec-website-staging`, version `9ec01b55-e0ee-49d7-8c6c-1b71b68595cb`) after applying migration 0028. Built from the existing live content revision 84, preserving its domain and media CDN. The live database and published snapshot contain no Google Ads ID; the owner confirmed they do not have one yet, so tracking remains disabled.

Verified the new fields in the authenticated live admin. An invalid ID (`AW-invalid`) is refused without saving it. Public Home, Dental Packages, an implant service page and the health endpoint return HTTP 200. Live API checks confirmed invalid forms return 422, cross-origin requests return 403, and honeypots return success without a conversion receipt or stored consultation. Email notifications were already enabled, so these tests deliberately did not insert a real lead or enqueue a test notification. The production build passed SEO/link checks and all seven mocked Google Ads browser scenarios.

Actual Google tag delivery, Tag Assistant verification and campaign attribution remain untested until the account ID and conversion labels are available. No advertising campaign was started or budget spent.
