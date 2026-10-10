-- Starting content for the admin to edit. Applied by `npm run db:seed` (local) and `npm run db:seed:staging`.
-- NEVER run it against production: it holds the design's sample content, which the clinic has not confirmed
-- (doctor credentials, branch addresses, contact details). It can be run again: rows that exist are kept.
--
-- Mirrors the structured content in src/data (copied from Figma, which in places is dummy data).
-- Prices, "what is included" lists and article text are intentionally NOT seeded: no invented numbers or claims.
-- page_sections is not seeded either: a section nobody has edited shows the built-in text from
-- src/data/sections.ts, and the "Page text" form starts from it. Seeding it would make unchecked sample claims
-- look like text the clinic had approved.

insert or ignore into site_settings (
  site_name, tagline, phone_display, phone_intl, whatsapp_url, contact_email,
  address_line, opening_hours, copyright_text
) values (
  'Melatec Dental Clinic',
  'We''re here to help you achieve a healthy, confident smile with advanced care you can trust.',
  '(+84) 98 940 22 11',
  '+84 98 940 22 11',
  'https://wa.me/84989402211',
  'melatecdental26@gmail.com',
  '26 Doan Thi Diem, O Cho Dua, Hanoi, Vietnam',
  'Monday–Sunday · 8:00–20:00',
  '© 2026 Melatec Dental Clinic. All Rights Reserved.'
);

-- Routes marked PROVISIONAL in src/data/*.ts are not confirmed with the owner yet.
insert into navigation_items (location, label, href, sort_order)
select * from (values
  ('utility', 'Dental Knowledge', '/dental-knowledge', 1),
  ('header', 'Home', '/', 1),
  ('header', 'About us', '/about', 2),
  ('header', 'Services', '/services', 3),
  ('header', 'Dental Packages', '/dental-packages', 4),
  ('header', 'Travel Guide', '/travel-guide', 5),
  ('header', 'Contact', '#consultation', 6),
  ('footer_treatment', 'Dental Implants', '/services/dental-implants', 1),
  ('footer_treatment', 'Porcelain Veneers', '/services', 2),
  ('footer_treatment', 'Dental Crowns', '/services', 3),
  ('footer_treatment', 'Orthodontic Braces', '/services', 4),
  ('footer_treatment', 'General Dentistry', '/services', 5),
  ('footer_explore', 'About Us', '/about', 1),
  ('footer_explore', 'Dental Packages', '/dental-packages', 2),
  ('footer_explore', 'Dental Travel Guide', '/travel-guide', 3),
  ('footer_explore', 'Contacts', '#consultation', 4),
  ('footer_legal', 'Privacy Policy', '/privacy-policy', 1),
  ('footer_legal', 'Cookie settings', '/cookie-settings', 2),
  ('footer_legal', 'Legal Disclaimer', '/legal-disclaimer', 3)
) where not exists (select 1 from navigation_items);

insert or ignore into locations (slug, name, address_line, sort_order) values
  ('ha-noi', 'Melatec Ha Noi', '26 Doan Thi Diem Street, O Cho Dua Ward, Ha Noi', 1),
  ('lao-cai', 'Melatec Lao Cai', 'Lot 325, Nga 6 Roundabout, Kim Tan Ward, Lao Cai City', 2),
  ('hai-phong', 'Melatec Hai Phong', '95 Bach Dang Street, Hong Bang District, Hai Phong City', 3);

insert or ignore into destinations (slug, name, summary, sort_order) values
  ('da-nang', 'Da Nang city',
   'A vibrant coastal city known for its beautiful beaches, modern lifestyle and easy access to iconic destinations such as Hoi An and Ba Na Hills — ideal for combining dental treatment with a relaxing getaway.',
   1);

-- Doctor details come from the Figma design and have not been verified by the clinic.
insert or ignore into doctors (slug, full_name, role_title, bio, credentials, sort_order) values
  ('pham-truong-son', 'Dr. Pham Truong Son', 'Orthodontist & Implantologist',
   'A graduate of Hanoi Medical University, Dr. Pham Truong Son brings more than 15 years of clinical experience in dentistry. With a strong professional foundation and a patient-centred approach, he has earned the trust of patients throughout his career, successfully completing more than 2,000 restorative and orthodontic cases.',
   json_array(
     'Doctor of Dentistry – Hanoi Medical University',
     'Advanced Certification in Orthodontics & Implant Dentistry',
     'Licensed Dental Practitioner, certified by the Ministry of Health',
     '15+ years of clinical experience with over 2,000 successful restorative and orthodontic cases'),
   1),
  ('tran-van-truong', 'Dr. Tran Van Truong', 'Implantologist',
   'A graduate of Hanoi Medical University, Dr. Tran Van Truong specialises in Implant Dentistry with advanced training in implant placement, bone grafting and sinus lift procedures. Dr. Truong has successfully completed nearly 1,000 dental implant cases, delivering personalised treatment plans for each patient.',
   json_array(
     'Doctor of Dentistry – Hanoi Medical University',
     'Completed professional training in Dental Implantology, Bone Grafting & Sinus Lift Procedures',
     'Regularly participates in Continuing Medical Education (CME) and professional training in Vietnam and abroad'),
   2),
  ('le-thi-yen', 'Dr. Le Thi Yen', 'Orthodontist & Implantologist',
   'A Specialist Level I in Odonto-Stomatology from Hai Phong University of Medicine and Pharmacy, Dr. Le Thi Yen has a strong professional foundation with particular expertise in dentofacial orthopedics and advanced implant dentistry.',
   json_array(
     'Doctor of Medicine – Thai Binh University of Medicine and Pharmacy',
     'Certified in Dentofacial Orthopedics (Orthodontics)',
     'Certified in Dental Implantology',
     'Licensed Dental Practitioner in Odonto-Stomatology, certified by the Ministry of Health'),
   3),
  ('nguyen-ngoc-quang', 'Dr. Nguyen Ngoc Quang', 'Orthodontist & Implantologist',
   'A graduate in Odonto-Stomatology from Hue University of Medicine and Pharmacy, Dr. Nguyen Ngoc Quang has extensive advanced training in cosmetic dentistry. He is known for his professional, attentive and gentle approach, helping patients feel comfortable and reassured throughout treatment.',
   json_array(
     'Doctor of Odonto-Stomatology – Hue University of Medicine and Pharmacy',
     'Undertook several years of advanced training in Cosmetic Dentistry',
     'Licensed Dental Practitioner in Odonto-Stomatology, certified by the Ministry of Health'),
   4);

-- The design shows the questions only. Answers stay null until the clinic provides them.
insert into faqs (group_key, question, sort_order)
select * from (values
  ('dental-implants', 'What should I send before my consultation?', 1),
  ('dental-implants', 'How many visits will my treatment require?', 2),
  ('dental-implants', 'What is included in my estimate?', 3),
  ('dental-implants', 'Can you help with accommodation and transport?', 4)
) where not exists (select 1 from faqs);

-- The pages the website has, so their search text can be edited without pressing "Add the website's pages".
-- Keep in step with BUILTIN_PAGES in src/lib/cms/pages.ts.
insert or ignore into pages (path, title) values
  ('/', 'Home'),
  ('/about', 'About us'),
  ('/services', 'Services'),
  ('/services/dental-implants', 'Dental implants'),
  ('/our-doctors', 'Our doctors'),
  ('/dental-packages', 'Dental packages'),
  ('/dental-packages/travel-combos', 'Travel combos'),
  ('/locations', 'Our locations'),
  ('/travel-guide', 'Dental travel guide'),
  ('/dental-knowledge', 'Dental knowledge');

-- The five treatments of the footer list. Only the Dental Implants description comes from the design; no price
-- and no "what is included" lines: the clinic fills those in.
insert or ignore into services (slug, title, summary, sort_order) values
  ('dental-implants', 'Dental Implants',
   'Comprehensive implant solutions, including single-tooth implants, All-on-4 and All-on-6 restorations, using premium implant systems for enhanced safety, stability and long-term function.',
   1),
  ('porcelain-veneers', 'Porcelain Veneers', null, 2),
  ('dental-crowns', 'Dental Crowns', null, 3),
  ('orthodontic-braces', 'Orthodontic Braces', null, 4),
  ('general-dentistry', 'General Dentistry', null, 5);

-- The three implant options named on the Dental Implants page. No price: the cards then invite a quote request.
-- There are no Travel Combos: nothing in the design says what a combo contains.
insert or ignore into packages (slug, kind, title, service_id, sort_order) values
  ('single-tooth-implant', 'single_treatment', 'Single-tooth implant',
   (select id from services where slug = 'dental-implants'), 1),
  ('all-on-4', 'single_treatment', 'All-on-4 restoration',
   (select id from services where slug = 'dental-implants'), 2),
  ('all-on-6', 'single_treatment', 'All-on-6 restoration',
   (select id from services where slug = 'dental-implants'), 3);
