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

export const gallery: Img[] = [
  { src: vietnam1, alt: 'A stone pagoda on a small island in a lake surrounded by trees' },
  { src: vietnam2, alt: 'Fishing boats in a bay between limestone karst islands' },
  { src: vietnam3, alt: 'A sandy beach with a hillside temple and turquoise sea' },
  { src: vietnam4, alt: 'A golden footbridge held by two giant stone hands above the clouds' },
  { src: vietnam5, alt: 'A hilltop castle-style village wrapped in mist' },
  { src: vietnam6, alt: 'An illuminated bridge over a river city at dusk' },
];

// Heading of the branch cards; the cards come from the Locations module (getLocations).
export const destinations = {
  label: 'Dental destination in Vietnam',
  title: 'Exceptional dental care in destinations worth discovering',
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

// The Travel Combos price cards until combos are published (Packages, "Shown on: Travel Combos"). SAMPLE routes,
// prices and inclusions of the design (2026-10-17), not confirmed by the clinic. Only the Da Nang card has a photo:
// the design's photos have no known source, and the gallery has no picture of the other places.
export const comboCards = [
  {
    title: 'Ha Noi - Da Lat',
    price: '$199',
    unit: 'per person',
    inclusions: [
      '3 night hotel stay - 3 buffet breakfasts',
      'Round-trip flights: Vietnam Airlines (one-way with checked baggage) and VietJet Air (one-way)',
      'Complimentary in-room coffee and water',
      'Centrally located hotel with convenient access to local attractions',
    ],
  },
  {
    title: 'Ha Noi - Da Nang',
    price: '$139',
    unit: 'per person',
    inclusions: [
      '3 night hotel stay - 3 buffet breakfasts',
      'Round-trip flights',
      'Complimentary in-room coffee and water',
      'Hotel just a 2-minute walk from the beach',
    ],
    image: {
      src: vietnam4,
      alt: 'A golden footbridge held by two giant stone hands above the clouds',
    } satisfies Img,
  },
  {
    title: 'Ha Noi - Phu Quoc',
    price: '$139',
    unit: 'per person',
    inclusions: [
      '3 night hotel stay - 3 buffet breakfasts',
      'Round-trip flights with checked baggage included both ways (Sun PhuQuoc Airways one way, VietJet Air the other)',
      'Complimentary in-room coffee and water',
      'Hotel just a 2-minute walk from the beach',
    ],
  },
  {
    title: 'Ha Noi - Sa Pa',
    price: '$119',
    unit: 'per person',
    inclusions: [
      '3 night hotel stay',
      'Round-trip cabin bus tickets',
      'Complimentary in-room coffee and water',
      'Centrally located hotel near the town square, with convenient access to local attractions',
      'Approximately 1 km from the Fansipan cable car station',
    ],
  },
];
