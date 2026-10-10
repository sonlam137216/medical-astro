/**
 * Dental Packages / Travel Combos content (Figma, 2026-10-04).
 * PLACEHOLDER notes: the gallery and "Discover Vietnam" photos are real but unlabeled in the design;
 * the Da Nang cards are repeated dummy entries.
 */
import type { Img } from './types';
import vietnam1 from '../assets/images/photos/vietnam-1.webp';
import vietnam2 from '../assets/images/photos/vietnam-2.webp';
import vietnam3 from '../assets/images/photos/vietnam-3.webp';
import vietnam4 from '../assets/images/photos/vietnam-4.webp';
import vietnam5 from '../assets/images/photos/vietnam-5.webp';
import vietnam6 from '../assets/images/photos/vietnam-6.webp';
import daNang from '../assets/images/photos/da-nang.webp';
import { destinations as homeDestinations } from './home';

export const gallery: Img[] = [
  { src: vietnam1, alt: 'A stone pagoda on a small island in a lake surrounded by trees' },
  { src: vietnam2, alt: 'Fishing boats in a bay between limestone karst islands' },
  { src: vietnam3, alt: 'A sandy beach with a hillside temple and turquoise sea' },
  { src: vietnam4, alt: 'A golden footbridge held by two giant stone hands above the clouds' },
  { src: vietnam5, alt: 'A hilltop castle-style village wrapped in mist' },
  { src: vietnam6, alt: 'An illuminated bridge over a river city at dusk' },
];

// Branch cards of the Figma page ("Chi nhánh: 26 Đoàn Thị Điểm…" repeated seven times). The three real branch
// addresses of the Home page stand in for the repeated sample; the grid centres any number of cards.
export const destinations = {
  label: 'Dental destination in Vietnam',
  title: 'Exceptional dental care in destinations worth discovering',
  cards: homeDestinations.locations,
};

export const discover = {
  // The design reuses "Find Us and Stay Connected" (the social row heading) here, which reads as a mistake.
  label: 'Discover Vietnam',
  title: 'Destinations to Explore During Your Stay',
  // PLACEHOLDER: three identical cards in the design
  cards: Array.from({ length: 3 }, () => ({
    name: 'Da Nang city',
    address:
      'A vibrant coastal city known for its beautiful beaches, modern lifestyle and easy access to iconic destinations such as Hoi An and Ba Na Hills — ideal for combining dental treatment with a relaxing getaway.',
    // The Da Nang cards are sample entries; the Travel Guide is where destination articles live.
    href: '/travel-guide',
    linkLabel: 'Explore more',
    image: {
      src: daNang,
      alt: 'Da Nang city skyline and the dragon bridge over the river',
    } satisfies Img,
  })),
  cta: { label: 'View all', href: '/travel-guide' },
};
