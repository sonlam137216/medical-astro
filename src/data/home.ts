/**
 * Home page content, copied from the Figma "Melatec / Refined / Home" frame (2026-10-04).
 * Moves to the database (pages / page_sections + services, doctors ...) as the CMS grows (Phase 5).
 *
 * Many values in the Figma file are obvious dummy data (five identical service cards,
 * identical "C$1,250 / 40 clinics" cells, one photo reused for every doctor). They are
 * reproduced as designed and marked PLACEHOLDER. Do not publish them as real facts.
 */
import type { Img } from './types';
import { directionsUrl } from '../lib/maps';
import hanoiTower from '../assets/images/photos/hanoi-turtle-tower.webp';
import dentalImplant from '../assets/images/photos/dental-implant.webp';
import digitalScan from '../assets/images/photos/dentist-digital-scan.webp';
import hotelRoom from '../assets/images/photos/hotel-room.webp';
import xray from '../assets/images/photos/panoramic-xray.webp';
import beforeAfter from '../assets/images/photos/before-after.webp';
import doctorPortrait from '../assets/images/doctors/doctor-portrait.webp';
import lakeAndTrees from '../assets/images/photos/lake-and-trees.webp';
import homeHero from '../assets/images/photos/home-hero.webp';

export type { Img };

export const heroImage: Img = {
  src: homeHero,
  alt: 'A dentist at a modern treatment chair, with the Hanoi Turtle Tower in the background',
};

export const hero = {
  label: 'Melatec Dental Clinic. Viet Nam',
  title: 'Every Perfect Journey Begins with a Radiant Smile',
  paragraphs: [
    'Premium dentistry, thoughtfully tailored to you.',
    'From dental implants and porcelain crowns to veneers and complete smile makeovers, every treatment is guided by clinical precision and refined care.',
    'English-speaking specialists, advanced technology and a truly personalized experience all in Vietnam.',
  ],
  // PLACEHOLDER: a claim of the design ("20+ countries"); the owner must confirm it.
  trust: 'Trusted by patients from 20+ countries\nAustralia · USA · UK · France · Japan · Korea',
};

export const servicesHeading = { label: 'Our services', title: 'Treatments for every smile' };

export const patientSupport = [
  { number: '01', title: 'Affordable Care\nInternational Standards' },
  { number: '02', title: 'Experienced & Dedicated\nDental Specialists' },
  { number: '03', title: 'Dedicated Support\nfor International Patients' },
  { number: '04', title: 'Dental Care Meets\nthe Vietnam Experience' },
];

// PLACEHOLDER: five identical cards and "600$" are dummy values from the design; the four bullet lines are
// English stand-ins for the design's Vietnamese sample text. Replaced by services from the CMS (A1).
export const services = Array.from({ length: 5 }, () => ({
  title: 'Dental Implants',
  inclusions: Array.from({ length: 4 }, () => 'Lower cost, same quality of care'),
  total: 'TOTAL: 600$',
  href: '/services/dental-implants', // PROVISIONAL
  image: { src: dentalImplant, alt: 'Dental implant on a soft white background' } satisfies Img,
}));

export const conversations = {
  label: 'Hear from our dentists & patients',
  title: 'Real conversations.\nExpert insights.\nPersonal experiences.',
  body: 'Go behind the scenes of dental care in Vietnam through conversations with our dentists and international patients. Discover our approach to treatment, hear real experiences and learn what to expect before beginning your own dental journey.',
  // The photo in Figma has promotional Vietnamese text baked into it ("MIỄN … Thăm khám với BS chuyên môn").
  image: {
    src: digitalScan,
    alt: 'A dentist reviewing a digital scan of teeth with a patient',
  } satisfies Img,
};

// PLACEHOLDER: every cell in the Figma table is "C$1,250 / 40 clinics" and every saving is "—".
export const costComparison = {
  label: 'Treatment costs',
  title: 'Exceptional dental care.\nMade more accessible.',
  subtitle: 'Compare against prices in Australia',
  countries: ['Vietnam', 'United States', 'Australia', 'United Kingdom', 'Canada', 'New Zealand'],
  rows: [
    { name: 'Dental implants', note: 'Implant tooth replacement' },
    { name: 'All-on-4 & All-on-6', note: 'Full-arch restoration with four or six implants' },
    { name: 'Porcelain veneers', note: 'Thin porcelain shells for a natural smile' },
    { name: 'Dental crowns', note: 'Custom crowns for damaged or weakened teeth' },
    { name: 'Root canal treatment', note: 'Per tooth, crown excluded' },
  ],
  cell: { price: 'C$1,250', clinics: '40 clinics' }, // PLACEHOLDER
  saving: '—',
  methodologyTitle: 'How these figures are worked out',
};

export const whyMelatec = {
  label: 'Why Melatec Luxury Dental',
  title: 'Premium dental journey, from first consultation to final smile',
  body: 'Experienced dentists, personalised care, advanced technology and dedicated support thoughtfully brought together for international patients seeking exceptional dental care in Vietnam.',
  items: [
    {
      number: '01',
      title: 'Experienced Team',
      body: 'Skilled dentists and an English-speaking care team dedicated to precise, attentive treatment.',
    },
    {
      number: '02',
      title: 'Personalised Plans',
      body: 'Every treatment is tailored to your oral health, aesthetic goals and individual needs.',
    },
    {
      number: '03',
      title: 'Modern Technology',
      body: 'Digital diagnostics, 3D imaging and modern CAD/CAM technology for precise treatment planning.',
    },
    {
      number: '04',
      title: 'Transparent, Fair Pricing',
      body: 'Clear quotations, quality materials and carefully considered treatment options with no hidden costs.',
    },
    {
      number: '05',
      title: 'Complete Support',
      body: 'From planning your visit to post-treatment follow-up, our team is here to support your journey.',
    },
  ],
};

// PLACEHOLDER: Figma reuses one hotel-room photo for all five tiles.
export const insideClinic = {
  label: 'Inside Melatec',
  title: 'A comfortable space for your care',
  tiles: [
    'Melatec Dental Clinic Exterior',
    'Waiting Lounge',
    'Consultation Room',
    'Treatment Area',
    'Recovery Room',
  ].map((caption) => ({
    caption,
    image: { src: hotelRoom, alt: `${caption} (placeholder photo)` } satisfies Img,
  })),
};

export const destinations = {
  label: 'Dental destinations in Vietnam',
  cta: { label: 'See all locations', href: '/locations' },
  locations: [
    { name: 'Melatec Ha Noi', address: '26 Doan Thi Diem Street, O Cho Dua Ward, Ha Noi' },
    { name: 'Melatec Lao Cai', address: 'Lot 325, Nga 6 Roundabout, Kim Tan Ward, Lao Cai City' },
    {
      name: 'Melatec Hai Phong',
      address: '95 Bach Dang Street, Hong Bang District, Hai Phong City',
    },
  ].map((l) => ({
    ...l,
    // A Google Maps search for the address; replace with a place link when the locations module (A4) exists.
    href: directionsUrl(l.address) ?? '/locations',
    image: { src: hanoiTower, alt: `${l.name} (placeholder photo)` } satisfies Img,
  })),
};

// PLACEHOLDER: one portrait is reused for every doctor in the design.
export const doctors = {
  label: 'Our doctors',
  title: 'Meet Our Specialists',
  body: 'Rooted in the principles of the Hippocratic Oath, our dentists bring expertise, precision and genuine care to every treatment.',
  cta: { label: 'View our doctors', href: '/our-doctors' }, // PROVISIONAL
  people: [
    { name: 'Dr. Pham Truong Son', role: 'Orthodontist & Implantologist' },
    { name: 'Dr. Le Thi Yen', role: 'Orthodontist & Implantologist' },
    { name: 'Dr. Tran Van Truong', role: 'Implantologist' },
    { name: 'Dr. Nguyen Ngoc Quang', role: 'Orthodontist & Implantologist' },
  ].map((p) => ({
    ...p,
    href: '/our-doctors', // PROVISIONAL
    image: { src: doctorPortrait, alt: `Portrait of ${p.name}` } satisfies Img,
  })),
};

export const howItWorks = {
  label: 'How it works',
  title: 'Dental Journey, Made Simple',
  steps: [
    {
      number: '01',
      title: 'Send Us a Photo',
      body: 'Share photos of your teeth and any X-rays you have.',
    },
    {
      number: '02',
      title: 'Get Your Options',
      body: 'Receive treatment options, pricing and timelines from selected clinics.',
    },
    {
      number: '03',
      title: 'Compare & Choose',
      body: 'Compare your options and choose the clinic that suits you.',
    },
    {
      number: '04',
      title: 'Travel & Get Treated',
      body: 'Plan your visit, meet your dentist and begin treatment in Vietnam.',
    },
  ].map((s) => ({ ...s, image: { src: xray, alt: '' } satisfies Img })), // PLACEHOLDER: same X-ray on every card
  helpTitle: 'Need help or have questions?',
  helpBody: 'A dedicated team will support you at every step of your journey.',
};

// The Figma image has a "BEFORE / AFTER" slider and handle baked in, and shows a real person:
// confirm the patient's written consent and usage rights before this goes public.
export const smileStories = {
  label: 'Smile transformations',
  title: 'Real Stories. Real Smiles.',
  summary:
    'The patient had multiple spaces between the teeth, including several areas with more noticeable gaps. The teeth were also discolored, with uneven coloration that affected the overall harmony of the smile',
  detailsTitle: 'Treatment Details',
  details: ['Smile design planning with digital preview', '20 DIDIBIO porcelain restorations'],
  image: {
    src: beforeAfter,
    alt: 'Before and after comparison of a patient’s smile',
  } satisfies Img,
};

// PLACEHOLDER: the design repeats one sample article four times. Shown only before the first publish; after
// that the section lists the published Travel Guide articles (or is hidden when there are none), see
// components/home/TravelGuide.astro.
const sampleArticle = {
  title: 'Hoan Kiem Lake: The Heart of Hanoi and Your Sanctuary for Recovery',
  excerpt:
    'In the bustling center of Vietnam’s capital lies Hoan Kiem Lake, a serene oasis that serves as the spiritual and cultural heart of Hanoi.',
  href: '/travel-guide', // PROVISIONAL
  image: {
    src: lakeAndTrees,
    alt: 'Hoan Kiem Lake with trees in the foreground (placeholder photo)',
  } satisfies Img,
};

export const travelGuide = {
  label: 'Dental travel guide',
  title: 'Discover the Beauty of VietNam',
  cta: { label: 'Explore more', href: '/travel-guide' }, // PROVISIONAL
  featured: sampleArticle,
  more: [sampleArticle, sampleArticle, sampleArticle],
};
