/**
 * About page content (Figma "Melatec / Refined / About", 2026-10-04).
 * The figures in `stats` are marketing claims taken from the design: the owner must confirm
 * each one is accurate and can be substantiated before launch.
 */
import type { Img } from './types';
import clinicReception from '../assets/images/photos/clinic-reception.webp';
import clinicLobby from '../assets/images/photos/clinic-lobby.webp';
import clinicWaitingA from '../assets/images/photos/clinic-waiting-a.webp';
import clinicWaitingB from '../assets/images/photos/clinic-waiting-b.webp';

export const aboutHero = {
  label: 'About us.',
  title: 'Welcome to Melatec Dental Clinic',
  paragraphs: [
    'Melatec Dental Clinic welcomes international patients seeking high-quality dental care in Vietnam. Combining modern dental technology, experienced dentists, personalized treatment plans, and attentive patient support, we aim to make every treatment journey smooth, comfortable, and transparent.',
    'From cosmetic dentistry and dental implants to restorative treatments and general dental care, Melatec Dental Clinic provides comprehensive solutions for patients who want to improve their smiles while enjoying their stay in Vietnam.',
  ],
};

export const stats = [
  { value: '30,000+', label: 'Satisfied Customers Worldwide' },
  { value: '10,000+', label: 'Successful Dental Implants' },
  { value: '10,000+', label: 'Cosmetic Porcelain Crowns' },
  { value: '5,000+', label: 'Cosmetic Veneer Crowns' },
];

const reception: Img = { src: clinicReception, alt: 'Melatec Dental Clinic reception desk' };

export const personalisedCare = {
  label: 'Your home away from home',
  title: 'Personalized Care, International Standards',
  rows: [
    {
      title: 'Advanced Implant Care, Built for Lasting Results',
      body: 'Specialized in full-arch rehabilitation and advanced implant dentistry, supported by digital technology and experienced specialists.',
      image: reception,
    },
    {
      title: 'The Art of Aesthetic Dentistry',
      body: 'Dedicated to enhancing your smile with personalized aesthetic treatments designed for natural, harmonious results.',
      image: reception, // PLACEHOLDER: same photo twice in the design
    },
  ],
};

// Copy from the Figma "Why choose Melatec" cards (the sixth card repeats the first in the design).
export const whyChoose = {
  label: 'Why choose Melatec',
  title: 'Premium Care, Beautiful Smiles in Vietnam',
  items: [
    {
      title: 'Experienced team',
      body: 'Dentists with international training and a team of nurses and coordinators who speak English.',
    },
    {
      title: 'Personalized Plans',
      body: 'Every treatment is tailored to your oral health, aesthetic goals and individual needs.',
    },
    {
      title: 'Modern Technology',
      body: 'Digital diagnostics, 3D imaging and modern CAD/CAM technology for precise treatment planning.',
    },
    {
      title: 'Transparent, Fair Pricing',
      body: 'Clear quotations, quality materials and carefully considered treatment options with no hidden costs.',
    },
    {
      title: 'Complete Support',
      body: 'From planning your visit to post-treatment follow-up, our team is here to support your journey.',
    },
    {
      title: 'Experienced team',
      body: 'Dentists with international training and a team of nurses and coordinators who speak English.',
    },
  ],
};

export const insideClinic = {
  label: 'Our dental clinic',
  title: 'Inside Melatec Dental Clinic',
  photos: [
    { src: clinicLobby, alt: 'Clinic lobby with seating area' },
    { src: clinicLobby, alt: 'Clinic lobby with seating area' }, // PLACEHOLDER: repeated in the design
    { src: clinicWaitingA, alt: 'Waiting lounge and reception' },
    { src: clinicWaitingB, alt: 'Waiting lounge seating' },
  ] satisfies Img[],
};
