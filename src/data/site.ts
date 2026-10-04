/**
 * Site-wide content. Text is copied from the Figma design (2026-10-04).
 * This will move to Supabase (site_settings / navigation_items) when the CMS exists (Phase 5);
 * keeping it as typed data now means components do not change when the source does.
 *
 * Routes marked PROVISIONAL are not in Figma. Confirm the final URL structure with the owner.
 */

export interface NavLink {
  label: string;
  href: string;
}

export const site = {
  name: 'Melatec Dental Clinic',
  phoneDisplay: '(+84) 98 940 22 11',
  phoneIntl: '+84 98 940 22 11',
  // wa.me needs digits only; derived from the number in the design.
  whatsappUrl: 'https://wa.me/84989402211',
  email: 'melatecdental26@gmail.com',
  addressLine: '26 Doan Thi Diem, O Cho Dua, Hanoi, Vietnam',
  hours: 'Monday–Sunday · 8:00–20:00',
  tagline:
    "We're here to help you achieve a healthy, confident smile with advanced care you can trust.",
  copyright: '© 2026 Melatec Dental Clinic. All Rights Reserved.',
} as const;

export const utilityLink: NavLink = { label: 'Dental Knowledge', href: '/dental-knowledge' }; // PROVISIONAL

export const mainNav: NavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'About us', href: '/about' }, // PROVISIONAL
  { label: 'Services', href: '/services' }, // PROVISIONAL
  { label: 'Dental Packages', href: '/dental-packages' }, // PROVISIONAL
  { label: 'Travel Guide', href: '/travel-guide' }, // PROVISIONAL
  { label: 'Contact', href: '#consultation' },
];

export const footerTreatments: NavLink[] = [
  { label: 'Dental Implants', href: '/services/dental-implants' }, // PROVISIONAL
  { label: 'Porcelain Veneers', href: '/services' }, // PROVISIONAL
  { label: 'Dental Crowns', href: '/services' }, // PROVISIONAL
  { label: 'Orthodontic Braces', href: '/services' }, // PROVISIONAL
  { label: 'General Dentistry', href: '/services' }, // PROVISIONAL
];

export const footerExplore: NavLink[] = [
  { label: 'About Us', href: '/about' },
  { label: 'Dental Packages', href: '/dental-packages' },
  { label: 'Dental Travel Guide', href: '/travel-guide' },
  { label: 'Contacts', href: '#consultation' },
];

export const footerLegal: NavLink[] = [
  { label: 'Privacy Policy', href: '/privacy-policy' }, // PROVISIONAL
  { label: 'Cookie settings', href: '/cookie-settings' }, // PROVISIONAL
  { label: 'Legal Disclaimer', href: '/legal-disclaimer' }, // PROVISIONAL
];
