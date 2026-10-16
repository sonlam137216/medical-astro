/**
 * Dental Implants page (Figma "General Service Template", new file of 2026-10-10; the page doubles as the
 * service template, but only this one route exists until the services CMS (A1) is built).
 * The Figma file shows sample data in several places (3 identical price cards with Vietnamese bullets,
 * 6 identical "Experienced team" cards, 4 identical FAQ questions, a before/after carousel of one real
 * patient). Those are replaced by the copy kept from the previous design below or left out; every figure
 * and claim here must be confirmed by the clinic before launch.
 */
import type { Img } from './types';
import { heroImage as homeHeroImage } from './home';

// The current Figma hero is a light photo of a dentist with a patient; the Home chair photo stands in for it.
export const heroImage: Img = homeHeroImage;

export const hero = {
  label: 'Dental implants. Melatec Dental Clinic',
  title: 'Save more on implant treatment, get your plan before you fly',
  body: 'Comprehensive implant solutions, including single-tooth implants, All-on-4 and All-on-6 restorations, using premium implant systems for enhanced safety, stability and long-term function.',
  // Figma shows three small claim badges under the banner; the owner must confirm each one.
  chips: ['Actively responding 24/7', 'Consulting in English', 'Over 1,000 international patients'],
};

// PLACEHOLDER: prices and inclusions are the sample values of the current Figma file ("$400 per" is printed
// that way in the design, with nothing after "per"). The clinic must confirm every figure before launch.
const sharedInclusions = [
  'Complimentary airport, hotel, and clinic transfers',
  'Complimentary hotel stay',
  'Free consultation with a specialist dentist',
  'Free Cone Beam CT scan',
];

export const costs = {
  label: 'Treatment costs',
  title: 'What You Pay at Melatec',
};

// PLACEHOLDER: the price cards of the design, the sample treatments of the Dental Implants service until the
// services are published (src/lib/content.ts). Every figure and inclusion must be confirmed by the clinic.
export const costCards = [
  {
    title: 'Single Dental Implant',
    subtitle: 'Premium Korean Implant',
    inclusions: [
      '1 Korean implant fixture + abutment',
      'Premium porcelain crown',
      'Visa assistance',
      ...sharedInclusions,
    ],
    total: '$400 per',
  },
  {
    title: 'ALL-ON-4',
    subtitle: 'Premium Korean Implant',
    inclusions: [
      '4 Korean implant fixtures + abutments',
      'Temporary denture',
      '12 premium Zirconia crowns',
      ...sharedInclusions,
    ],
    total: '$3,100 per',
  },
  {
    title: 'ALL-ON-6',
    subtitle: 'Premium Korean Implant',
    inclusions: [
      '6 Korean implant fixtures + abutments',
      'Temporary denture',
      '14 premium Zirconia crowns',
      ...sharedInclusions,
    ],
    total: '$3,900 per',
  },
];

export const comparison = {
  label: 'Cost comparison',
  title: 'Compared with Other Countries',
  rows: [
    { name: 'Single implant, fixture only', note: 'Abutment and crown quoted separately.' },
    { name: 'All-on-4, per arch', note: 'Four implants plus the fixed bridge.' },
    { name: 'All-on-6, per arch', note: 'Six implants plus the fixed bridge.' },
  ],
};

// Six cards: the "Clear answers" and "Dental travel support" copy of the previous design stands in for the
// six identical "Experienced team" placeholders of the Figma file.
export const why = {
  label: 'Why Melatec Dental Clinic',
  title: 'High-Quality Implant Care at a Smarter Cost',
  items: [
    {
      title: 'Your treatment options',
      body: 'Discuss the recommended implant treatment and the options available for your case.',
    },
    {
      title: 'Your estimated cost',
      body: 'Receive a preliminary estimate and understand what is included in your plan.',
    },
    {
      title: 'Your expected timeline',
      body: 'Know how many visits may be needed and the estimated length of each stay.',
    },
    {
      title: 'Plan with confidence',
      body: 'Share your dental concerns and available scans. Receive a preliminary treatment plan and estimated cost.',
    },
    {
      title: 'Feel at home',
      body: 'Get help with airport transport, hotel arrangements and practical information during your stay.',
    },
    {
      title: 'Care around your stay',
      body: 'Discuss your treatment schedule, expected visits and suitable time for exploring Vietnam.',
    },
  ],
};

export const plan = {
  label: 'Get your treatment plan & estimate',
  title: 'Get Your Implant Plan Before Your Flight',
  body: 'Share your dental concerns and, if available, recent X-rays or CT scans. Our dental team will review your case and provide a preliminary treatment plan and estimated cost before your flight to Vietnam.',
  bullets: [
    'Receive a personalised treatment plan and estimated cost before your flight.',
    'Understand your recommended implant treatment, options and expected timeline.',
    'Know how many visits may be required and the estimated length of each stay.',
  ],
};
