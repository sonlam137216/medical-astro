// The pages the website has today. New pages need a template in the code, so the admin only edits the SEO
// text of these (and cannot create or rename pages: changing an address would break links).
export const BUILTIN_PAGES = [
  { path: '/', title: 'Home' },
  { path: '/about', title: 'About us' },
  { path: '/services', title: 'Services' },
  { path: '/services/dental-implants', title: 'Dental implants' },
  { path: '/our-doctors', title: 'Our doctors' },
  { path: '/dental-packages', title: 'Dental packages' },
  { path: '/dental-packages/travel-combos', title: 'Travel combos' },
  { path: '/locations', title: 'Our locations' },
  { path: '/travel-guide', title: 'Dental travel guide' },
  { path: '/dental-knowledge', title: 'Dental knowledge' },
] as const;
